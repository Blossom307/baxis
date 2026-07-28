// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable2Step.sol";

/**
 * @title BaxisEscrow Protocol v1.0.0
 * @author Baxis Protocol
 * @notice Production-grade non-custodial smart contract escrow for digital contracts & freelancing.
 * @dev Lifecycle: FUNDED ➔ SUBMITTED (Inspection Window Starts) ➔ RELEASED / REFUNDED / DISPUTED
 */
contract BaxisEscrow is ReentrancyGuard, Pausable, Ownable2Step {
    using SafeERC20 for IERC20;

    string public constant VERSION = "1.0.0";

    // --- ENUMS & STRUCTS ---

    enum EscrowStatus {
        NULL,       // 0: Non-existent
        FUNDED,     // 1: Client deposited, work in progress
        SUBMITTED,  // 2: Work submitted by freelancer, inspection window active
        RELEASED,   // 3: Funds transferred to freelancer
        REFUNDED,   // 4: Funds returned to client
        DISPUTED,   // 5: Frozen in dispute mode
        RESOLVED    // 6: Resolved by arbitrator
    }

    /**
     * @dev Gas-optimized struct layout (packed into 32-byte storage slots)
     */
    struct Escrow {
        address client;            // 20 bytes (Slot 1)
        address freelancer;        // 20 bytes (Slot 2)
        address token;             // 20 bytes (Slot 3)
        uint256 amount;            // 32 bytes (Slot 4 - net amount for freelancer)
        uint64 createdAt;          // 8 bytes  (Slot 5)
        uint64 submittedAt;        // 8 bytes  (Slot 5)
        uint64 inspectionWindow;   // 8 bytes  (Slot 5)
        uint64 completedAt;        // 8 bytes  (Slot 6)
        EscrowStatus status;       // 1 byte   (Slot 6)
    }

    // --- STATE VARIABLES ---

    address public treasury;

    uint256 public platformFeeBps = 300; // 300 basis points = 3.0%
    uint256 public constant MAX_FEE_BPS = 1000; // Hard cap: 10% maximum
    uint256 public constant BPS_DENOMINATOR = 10000;

    uint64 public constant MIN_INSPECTION_WINDOW = 1 days;   // 86,400 seconds
    uint64 public constant MAX_INSPECTION_WINDOW = 90 days;  // 7,776,000 seconds

    // Whitelist for official stablecoins (USDC, USDT, etc.)
    mapping(address => bool) public isSupportedToken;

    // Multi-arbitrator permission mapping for scalable governance
    mapping(address => bool) public isArbitrator;

    // Mapping from unique byte32 Gig ID to Escrow Vault
    mapping(bytes32 => Escrow) public escrows;

    // --- CUSTOM ERRORS ---

    error InvalidAddress();
    error InvalidGigId();
    error InvalidAmount();
    error InvalidFreelancer();
    error InvalidTimelock();
    error UnsupportedToken();
    error EscrowAlreadyExists();
    error InvalidStatus();
    error Unauthorized();
    error FeeTooHigh();
    error InspectionPeriodNotExpired();

    // --- EVENTS ---

    event EscrowFunded(
        bytes32 indexed gigId,
        address indexed client,
        address indexed freelancer,
        address token,
        uint256 gigAmount,
        uint256 feePaid,
        uint64 inspectionWindow
    );

    event WorkSubmitted(bytes32 indexed gigId, address indexed freelancer, uint64 submittedAt, uint64 inspectionDeadline);
    event EscrowReleased(bytes32 indexed gigId, address indexed freelancer, uint256 amount);
    event EscrowRefunded(bytes32 indexed gigId, address indexed client, uint256 amount);
    event DisputeRaised(bytes32 indexed gigId, address indexed initiator, bytes32 indexed evidenceHash);
    event DisputeResolved(
        bytes32 indexed gigId,
        address indexed freelancer,
        uint256 freelancerAmount,
        address indexed client,
        uint256 clientRefund
    );

    event SupportedTokenUpdated(address indexed token, bool supported);
    event ArbitratorUpdated(address indexed arbitrator, bool status);
    event ConfigUpdated(string setting, address indexed value);
    event FeeUpdated(uint256 newFeeBps);

    /**
     * @notice Initializes the Baxis Escrow Protocol with the treasury and deployer as initial arbitrator
     */
    constructor(address _treasury) Ownable(msg.sender) {
        if (_treasury == address(0)) revert InvalidAddress();
        treasury = _treasury;
        isArbitrator[msg.sender] = true;
        emit ArbitratorUpdated(msg.sender, true);
    }

    // --- ADMIN CONFIGURATION ---

    function setSupportedToken(address _token, bool _isSupported) external onlyOwner {
        if (_token == address(0)) revert InvalidAddress();
        isSupportedToken[_token] = _isSupported;
        emit SupportedTokenUpdated(_token, _isSupported);
    }

    function setArbitrator(address _arbitrator, bool _status) external onlyOwner {
        if (_arbitrator == address(0)) revert InvalidAddress();
        isArbitrator[_arbitrator] = _status;
        emit ArbitratorUpdated(_arbitrator, _status);
    }

    function setTreasury(address _newTreasury) external onlyOwner {
        if (_newTreasury == address(0)) revert InvalidAddress();
        treasury = _newTreasury;
        emit ConfigUpdated("Treasury", _newTreasury);
    }

    function setPlatformFee(uint256 _newFeeBps) external onlyOwner {
        if (_newFeeBps > MAX_FEE_BPS) revert FeeTooHigh();
        platformFeeBps = _newFeeBps;
        emit FeeUpdated(_newFeeBps);
    }

    function pause() external onlyOwner { _pause(); }
    function unpause() external onlyOwner { _unpause(); }

    // --- ESCROW CORE LOGIC ---

    function fundEscrow(
        bytes32 _gigId,
        address _freelancer,
        address _token,
        uint256 _gigAmount,
        uint64 _inspectionWindowSeconds
    ) external nonReentrant whenNotPaused {
        if (_gigId == bytes32(0)) revert InvalidGigId();
        if (_freelancer == address(0) || _token == address(0)) revert InvalidAddress();
        if (_freelancer == msg.sender) revert InvalidFreelancer();
        if (_gigAmount == 0) revert InvalidAmount();
        if (!isSupportedToken[_token]) revert UnsupportedToken();
        if (_inspectionWindowSeconds < MIN_INSPECTION_WINDOW || _inspectionWindowSeconds > MAX_INSPECTION_WINDOW) {
            revert InvalidTimelock();
        }
        if (escrows[_gigId].status != EscrowStatus.NULL) revert EscrowAlreadyExists();

        uint256 fee = (_gigAmount * platformFeeBps) / BPS_DENOMINATOR;
        uint256 totalCharge = _gigAmount + fee;

        escrows[_gigId] = Escrow({
            client: msg.sender,
            freelancer: _freelancer,
            token: _token,
            amount: _gigAmount,
            createdAt: uint64(block.timestamp),
            submittedAt: 0,
            inspectionWindow: _inspectionWindowSeconds,
            completedAt: 0,
            status: EscrowStatus.FUNDED
        });

        IERC20 tokenContract = IERC20(_token);
        tokenContract.safeTransferFrom(msg.sender, address(this), totalCharge);

        if (fee > 0) {
            tokenContract.safeTransfer(treasury, fee);
        }

        emit EscrowFunded(_gigId, msg.sender, _freelancer, _token, _gigAmount, fee, _inspectionWindowSeconds);
    }

    function submitWork(bytes32 _gigId) external whenNotPaused {
        Escrow storage escrow = escrows[_gigId];

        if (msg.sender != escrow.freelancer) revert Unauthorized();
        if (escrow.status != EscrowStatus.FUNDED) revert InvalidStatus();

        uint64 nowTime = uint64(block.timestamp);
        escrow.status = EscrowStatus.SUBMITTED;
        escrow.submittedAt = nowTime;

        uint64 deadline = nowTime + escrow.inspectionWindow;

        emit WorkSubmitted(_gigId, msg.sender, nowTime, deadline);
    }

    function releaseFunds(bytes32 _gigId) external nonReentrant whenNotPaused {
        Escrow storage escrow = escrows[_gigId];

        if (msg.sender != escrow.client) revert Unauthorized();
        if (escrow.status != EscrowStatus.FUNDED && escrow.status != EscrowStatus.SUBMITTED) {
            revert InvalidStatus();
        }

        escrow.status = EscrowStatus.RELEASED;
        escrow.completedAt = uint64(block.timestamp);

        IERC20(escrow.token).safeTransfer(escrow.freelancer, escrow.amount);

        emit EscrowReleased(_gigId, escrow.freelancer, escrow.amount);
    }

    function claimInspectionPayout(bytes32 _gigId) external nonReentrant whenNotPaused {
        Escrow storage escrow = escrows[_gigId];

        if (msg.sender != escrow.freelancer) revert Unauthorized();
        if (escrow.status != EscrowStatus.SUBMITTED) revert InvalidStatus();

        uint64 deadline = escrow.submittedAt + escrow.inspectionWindow;
        if (block.timestamp < deadline) revert InspectionPeriodNotExpired();

        escrow.status = EscrowStatus.RELEASED;
        escrow.completedAt = uint64(block.timestamp);

        IERC20(escrow.token).safeTransfer(escrow.freelancer, escrow.amount);

        emit EscrowReleased(_gigId, escrow.freelancer, escrow.amount);
    }

    function refundClient(bytes32 _gigId) external nonReentrant whenNotPaused {
        Escrow storage escrow = escrows[_gigId];

        if (msg.sender != escrow.freelancer) revert Unauthorized();
        if (escrow.status != EscrowStatus.FUNDED && escrow.status != EscrowStatus.SUBMITTED) {
            revert InvalidStatus();
        }

        escrow.status = EscrowStatus.REFUNDED;
        escrow.completedAt = uint64(block.timestamp);

        IERC20(escrow.token).safeTransfer(escrow.client, escrow.amount);

        emit EscrowRefunded(_gigId, escrow.client, escrow.amount);
    }

    function raiseDispute(bytes32 _gigId, bytes32 _evidenceHash) external whenNotPaused {
        Escrow storage escrow = escrows[_gigId];

        if (msg.sender != escrow.client && msg.sender != escrow.freelancer) revert Unauthorized();
        if (escrow.status != EscrowStatus.FUNDED && escrow.status != EscrowStatus.SUBMITTED) {
            revert InvalidStatus();
        }

        escrow.status = EscrowStatus.DISPUTED;

        emit DisputeRaised(_gigId, msg.sender, _evidenceHash);
    }

    function resolveDispute(bytes32 _gigId, uint256 _freelancerAmount) external nonReentrant {
        if (!isArbitrator[msg.sender] && msg.sender != owner()) revert Unauthorized();

        Escrow storage escrow = escrows[_gigId];
        if (escrow.status != EscrowStatus.DISPUTED) revert InvalidStatus();
        if (_freelancerAmount > escrow.amount) revert InvalidAmount();

        uint256 clientRefund = escrow.amount - _freelancerAmount;

        escrow.status = EscrowStatus.RESOLVED;
        escrow.completedAt = uint64(block.timestamp);

        IERC20 tokenContract = IERC20(escrow.token);

        if (_freelancerAmount > 0) {
            tokenContract.safeTransfer(escrow.freelancer, _freelancerAmount);
        }

        if (clientRefund > 0) {
            tokenContract.safeTransfer(escrow.client, clientRefund);
        }

        emit DisputeResolved(_gigId, escrow.freelancer, _freelancerAmount, escrow.client, clientRefund);
    }

    // --- VIEW HELPERS ---

    function escrowExists(bytes32 _gigId) external view returns (bool) {
        return escrows[_gigId].status != EscrowStatus.NULL;
    }

    function getInspectionDeadline(bytes32 _gigId) external view returns (uint64) {
        Escrow memory escrow = escrows[_gigId];
        if (escrow.status != EscrowStatus.SUBMITTED) return 0;
        return escrow.submittedAt + escrow.inspectionWindow;
    }

    function isInspectionExpired(bytes32 _gigId) external view returns (bool) {
        Escrow memory escrow = escrows[_gigId];
        if (escrow.status != EscrowStatus.SUBMITTED) return false;
        return block.timestamp >= (escrow.submittedAt + escrow.inspectionWindow);
    }
}