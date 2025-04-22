pragma solidity ^0.8.24;
interface IMACI{function publishMessage(bytes calldata)external;}
contract ElectionManager{
    IMACI immutable maci;
    event ElectionCreated(uint id,bytes32 meta);
    struct E{uint start;uint end;}
    mapping(uint=>E) public elections; uint public nextId;
    constructor(IMACI _m){maci=_m;}
    function createElection(bytes32 meta) external{ elections[nextId]=E(block.number,block.number+7200); emit ElectionCreated(nextId++,meta);}
    function enqueueMessage(uint vote,uint nonce,bytes calldata vcProof) external{ require(block.number<=elections[0].end,"closed"); maci.publishMessage(abi.encode(msg.sender,vote,nonce,vcProof));}
}
