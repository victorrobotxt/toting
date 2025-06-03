# init.sh – one‑shot repo bootstrap
set -e
d=(contracts circuits packages/frontend packages/backend .github/workflows)
for dir in "${d[@]}"; do mkdir -p "$dir"; done

cat > docker-compose.yml <<'YAML'
version: "3.9"
services:
  anvil: {image: ghcr.io/foundry-rs/foundry, command: ["anvil", "-m", "auto"], ports: ["8545:8545"]}
  redis: {image: redis:7-alpine, ports: ["6379:6379"]}
  db:    {image: postgres:16-alpine, environment: {POSTGRES_PASSWORD: pass}, ports: ["5432:5432"]}
YAML

cat > .github/workflows/ci.yml <<'YAML'
name: CI
on: [push, pull_request]
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
    - uses: actions/checkout@v4
    - uses: foundry-rs/foundry-toolchain@v1
    - run: forge test
    - uses: actions/setup-node@v4
      with: {node-version: 20}
    - run: npm i -g yarn
    - run: yarn install --immutable
    - run: yarn --cwd packages/frontend type-check
    - run: npx circom circuits/eligibility/eligibility.circom --r1cs --wasm --sym
YAML

cat > contracts/WalletFactory.sol <<'SOL'
pragma solidity ^0.8.24;
interface IVerifier{function verify(bytes calldata,bytes calldata)external view returns(bool);}
contract WalletFactory{
    IVerifier immutable v; mapping(address=>bool)public minted;
    event WalletMinted(address indexed user,address wallet);
    constructor(IVerifier _v){v=_v;}
    function mintWallet(bytes calldata proof,address pubKey) external returns(address){
        require(!minted[msg.sender],"dup");
        require(v.verify(proof,abi.encode(pubKey)),"bad");
        bytes20 salt=bytes20(pubKey);
        address wallet=address(uint160(uint(keccak256(abi.encodePacked(bytes1(0xff),address(this),salt,keccak256(type(Proxy).creationCode))))));
        new Proxy{salt:bytes32(salt)}(pubKey);
        minted[msg.sender]=true;
        emit WalletMinted(msg.sender,wallet);
        return wallet;
    }
}
contract Proxy{
    constructor(address owner){
        assembly{ sstore(0x00,owner) }
    }
}
SOL

cat > contracts/ElectionManager.sol <<'SOL'
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
SOL

cat > circuits/eligibility/eligibility.circom <<'CIR'
template Eligibility(){
  signal input eligibility;
  signal input pubKey[2];
  signal output valid;
  valid <== 1;
  eligibility === 1;
}
component main = Eligibility();
CIR

cat > packages/backend/main.py <<'PY'
from fastapi import FastAPI,Request,HTTPException
from jose import jwt
import httpx,os
app=FastAPI()
IDP=os.getenv("IDP_BASE","https://idp.example")
CID,RED=os.getenv("CID"),os.getenv("REDIR")
@app.get("/auth/initiate")
async def init():
    return {"url":f"{IDP}/auth?client_id={CID}&redirect_uri={RED}&scope=openid"}
@app.get("/auth/callback")
async def cb(code:str):
    async with httpx.AsyncClient() as c:
        r=await c.post(f"{IDP}/token",data={"code":code,"client_id":CID,"redirect_uri":RED})
    tok=r.json()["id_token"]
    try: jwt.decode(tok,options={"verify_signature":False})
    except: raise HTTPException(400,"bad token")
    return tok
PY

cat > packages/frontend/package.json <<'JSON'
{ "name":"frontend","private":true,"scripts":{"dev":"next dev","type-check":"tsc --noEmit"} }
JSON
yarn --cwd packages/frontend init -y >/dev/null
printf 'import Link from"next/link";export default function Auth(){return <Link href="/api/auth/initiate">Login</Link>}' > packages/frontend/pages/auth.tsx

echo 'SUBDIRS DONE'
