/**
 * BAXIS PROTOCOL — SMART CONTRACT CONFIGURATION (`contract-config.js`)
 */

const BAXIS_CONTRACT_ADDRESS = '0x98a3549EC5E4c613cEfC1FE97F390a731DcB81D1'; 
const USDC_TOKEN_ADDRESS = '0x036CbD53842c5426634e7929541eC2318f3dCF7e'; // Base Sepolia Testnet USDC

const BAXIS_CONTRACT_ABI = [
  "function fundEscrow(bytes32 _gigId, address _freelancer, address _token, uint256 _gigAmount, uint64 _inspectionWindowSeconds) external",
  "function submitWork(bytes32 _gigId) external",
  "function releaseFunds(bytes32 _gigId) external",
  "function claimInspectionPayout(bytes32 _gigId) external",
  "function refundClient(bytes32 _gigId) external",
  "function raiseDispute(bytes32 _gigId, bytes32 _evidenceHash) external",
  "function escrows(bytes32 _gigId) external view returns (address client, address freelancer, address token, uint256 amount, uint64 createdAt, uint64 submittedAt, uint64 inspectionWindow, uint64 completedAt, uint8 status)",
  "function getInspectionDeadline(bytes32 _gigId) external view returns (uint64)",
  "function isInspectionExpired(bytes32 _gigId) external view returns (bool)",
  "event EscrowFunded(bytes32 indexed gigId, address indexed client, address indexed freelancer, address token, uint256 gigAmount, uint256 feePaid, uint64 inspectionWindow)",
  "event WorkSubmitted(bytes32 indexed gigId, address indexed freelancer, uint64 submittedAt, uint64 inspectionDeadline)",
  "event EscrowReleased(bytes32 indexed gigId, address indexed freelancer, uint256 amount)",
  "event DisputeRaised(bytes32 indexed gigId, address indexed initiator, bytes32 indexed evidenceHash)"
];

const ERC20_ABI = [
  "function approve(address spender, uint256 amount) external returns (bool)",
  "function allowance(address owner, address spender) external view returns (uint256)",
  "function balanceOf(address account) external view returns (uint256)"
];

function getGigIdBytes32(escrowIdString) {
  return ethers.id(escrowIdString);
}