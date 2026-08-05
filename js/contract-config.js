/**
 * BAXIS PROTOCOL — SMART CONTRACT CONFIGURATION (`contract-config.js`)
 */

//  Base Mainnet Deployed Contract Address
const BAXIS_CONTRACT_ADDRESS = '0xebc5942d0053B1acEfF18B01086272667209Df5b'; 

// Official Base Mainnet Native USDC Address
const USDC_TOKEN_ADDRESS = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';

const BAXIS_CONTRACT_ABI = [
  // Core Escrow Actions
  "function fundEscrow(bytes32 _gigId, address _freelancer, address _token, uint256 _gigAmount, uint64 _inspectionWindowSeconds, bytes32 _agreementHash) external",
  "function submitWork(bytes32 _gigId) external",
  "function releaseFunds(bytes32 _gigId) external",
  "function claimInspectionPayout(bytes32 _gigId) external",
  "function cancelEscrow(bytes32 _gigId) external",
  "function refundClient(bytes32 _gigId) external",
  "function raiseDispute(bytes32 _gigId, bytes32 _evidenceHash) external",
  "function resolveDispute(bytes32 _gigId, uint256 _freelancerAmount) external",
  "function claimDisputeTimeoutFallback(bytes32 _gigId) external",

  // View Helpers
  "function escrows(bytes32 _gigId) external view returns (address client, address freelancer, address token, uint256 amount, bytes32 agreementHash, uint64 createdAt, uint64 submittedAt, uint64 inspectionWindow, uint64 disputedAt, uint64 completedAt, uint8 status)",
  "function getInspectionDeadline(bytes32 _gigId) external view returns (uint64)",
  "function isInspectionExpired(bytes32 _gigId) external view returns (bool)",
  "function escrowExists(bytes32 _gigId) external view returns (bool)",
  "function maxEscrowAmount() external view returns (uint256)",

  // Admin Configuration
  "function setSupportedToken(address _token, bool _isSupported) external",
  "function setArbitrator(address _arbitrator, bool _status) external",
  "function setTreasury(address _newTreasury) external",
  "function setPlatformFee(uint256 _newFeeBps) external",
  "function setMaxEscrowAmount(uint256 _newMaxAmount) external",

  // Contract Events
  "event EscrowFunded(bytes32 indexed gigId, address indexed client, address indexed freelancer, address token, uint256 gigAmount, uint256 feePaid, uint64 inspectionWindow, bytes32 agreementHash)",
  "event WorkSubmitted(bytes32 indexed gigId, address indexed freelancer, uint64 submittedAt, uint64 inspectionDeadline)",
  "event EscrowReleased(bytes32 indexed gigId, address indexed freelancer, uint256 amount)",
  "event EscrowRefunded(bytes32 indexed gigId, address indexed client, uint256 amount)",
  "event EscrowCancelled(bytes32 indexed gigId, address indexed client, uint256 refundAmount)",
  "event DisputeRaised(bytes32 indexed gigId, address indexed initiator, bytes32 indexed evidenceHash)",
  "event DisputeResolved(bytes32 indexed gigId, address indexed freelancer, uint256 freelancerAmount, address indexed client, uint256 clientRefund)",
  "event DisputeTimeoutClaimed(bytes32 indexed gigId, uint256 freelancerAmount, uint256 clientAmount)"
];

const ERC20_ABI = [
  "function approve(address spender, uint256 amount) external returns (bool)",
  "function allowance(address owner, address spender) external view returns (uint256)",
  "function balanceOf(address account) external view returns (uint256)"
];


function getGigIdBytes32(escrowIdString) {
  return ethers.id(escrowIdString);
}