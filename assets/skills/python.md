---
name: iqlabs-python
version: 2.0.0
description: IQLabs SDK on Solana — Python reference for on-chain data, IQDB tables, connections, and encryption
---

# IQLabs SDK — Python (Solana)

Python port of the IQLabs Solana SDK. Same four primitives (Code In, IQDB tables, connections, encryption), idiomatic Python with `asyncio`.

> Full docs: https://iqlabs.mintlify.app/docs-python ([LLM-friendly](https://iqlabs.mintlify.app/docs-python.md))
> PyPI: https://pypi.org/project/iqlabs-solana-sdk/
> GitHub: https://github.com/IQCoreTeam/iqlabs-solana-sdk-python

## Install

```bash
pip install iqlabs-solana-sdk
```

## Wallet / Signer setup

```python
from solana.rpc.async_api import AsyncClient
from solders.keypair import Keypair

connection = AsyncClient('https://api.mainnet-beta.solana.com')
signer = Keypair.from_bytes(bytes(secret_key))
```

Override the reader RPC anytime:

```python
from iqlabs import set_rpc_url

set_rpc_url('https://your-rpc.example.com')
```

---

## Core concepts

### Data Storage (Code In)

Inscribe any payload as transaction data. The SDK picks the upload mode by size:

- **< 700 bytes** — single inline transaction
- **< 8.5 KB** — multi-tx chunks
- **>= 8.5 KB** — parallel upload

### User State PDA

A per-user profile account. Auto-created the first time you call `code_in()`; first call may sign twice.

### Connection PDA

Two-party relationship: `pending`, `approved`, or `blocked`. Only the blocker can unblock.

### Database Tables

JSON tables under `db_root_id`. Identified by `(db_root_id, table_seed)`. `table_seed` is keccak256-hashed for PDA derivation; a human-readable `table_hint` is stored in `DbRoot.table_seeds` for discovery.

### Token & Collection Gating

```python
gate = {
    "mint": Pubkey,       # SPL token mint OR collection address
    "amount": int,        # min token amount (default 1; ignored for collections)
    "gate_type": int,     # GateType.TOKEN (default) or GateType.COLLECTION
}
```

### Table Creation Permissions

| Bucket | Storage | Permission field |
|--------|---------|------------------|
| **Public** | `table_seeds` + `global_table_seeds` | `table_creators` |
| **Private** | `global_table_seeds` only | `ext_creators` |

Empty list = anyone.

### Encryption

Three modes under `iqlabs.crypto`:

- **DH** — single-recipient X25519 ECDH → HKDF-SHA256 → AES-256-GCM
- **Password** — PBKDF2-SHA256 (250k iterations) → AES-256-GCM
- **Multi-recipient** — PGP-style hybrid

Derive a deterministic X25519 keypair from a wallet signature — no separate keystore.

---

## Function reference

### Data Storage

#### `code_in(connection, signer, chunks, filename=None, method=0, filetype='', on_progress=None)`

| **Returns** | tx signature (str) |
|---|---|

```python
from iqlabs import writer

signature = await writer.code_in(connection, signer, ['Hello, blockchain!'])

signature = await writer.code_in(
    connection, signer, ['file contents here'], filename='hello.txt'
)
```

#### `read_code_in(tx_signature, speed=None, on_progress=None)`

| **Returns** | dict with `metadata` (str), `data` (str or None) |
|---|---|

```python
from iqlabs import reader

result = await reader.read_code_in('5Xg7...')
print(result['data'])
print(result['metadata'])
```

`speed`: `'light' | 'medium' | 'heavy' | 'extreme'`

---

### Tables

#### `write_row(connection, signer, db_root_id, table_seed, row_json, skip_confirmation=False, remaining_accounts=None)`

First write auto-creates the table.

```python
from iqlabs import writer
import json

await writer.write_row(connection, signer, 'my-db', 'users', json.dumps({
    "id": 1, "name": "Alice", "email": "alice@example.com"
}))
```

#### `create_table(connection, signer, db_root_id, table_seed, table_name, column_names, id_col, ext_keys, gate=None, writers=None, table_hint=None)`

```python
from iqlabs import writer
from iqlabs.contract import GateType

# Basic — table_hint stored in DbRoot for discovery
await writer.create_table(
    connection, signer, 'my-db', 'users', 'users',
    ['name', 'email', 'age'], 'name', [],
    table_hint='users'
)

# Token gate
await writer.create_table(
    connection, signer, 'my-db', 'vip', 'vip',
    ['name'], 'user_id', [],
    gate={"mint": token_mint_pubkey, "amount": 100, "gate_type": GateType.TOKEN},
    table_hint='vip'
)

# NFT collection gate
await writer.create_table(
    connection, signer, 'my-db', 'holders', 'holders',
    ['name'], 'user_id', [],
    gate={"mint": collection_pubkey, "gate_type": GateType.COLLECTION},
    table_hint='holders'
)
```

#### `read_table_rows(account, before=None, limit=None, speed=None)`

| **Returns** | `list[dict]` |
|---|---|

```python
from iqlabs import reader

rows = await reader.read_table_rows(table_pda, limit=50)
older_rows = await reader.read_table_rows(table_pda, limit=50, before='sig...')
```

#### `get_tablelist_from_root(connection, db_root_id)`

| **Returns** | dict with `root_pda`, `creator`, `table_seeds`, `global_table_seeds` |
|---|---|

```python
from iqlabs import reader

result = await reader.get_tablelist_from_root(connection, 'my-db')
print('Creator:', result['creator'])
print('Table seeds:', result['table_seeds'])
```

#### `manage_row_data(connection, signer, db_root_id, seed, row_json, table_name=None, target_tx=None)`

Update an existing row.

```python
await writer.manage_row_data(
    connection, signer, 'my-db', 'users',
    json.dumps({"id": 1, "name": "Updated Name"}),
    table_name='users',
    target_tx=original_tx_sig
)
```

#### Table-creator permissions

```python
from iqlabs.contract import manage_table_creators_instruction

ix = manage_table_creators_instruction(
    builder,
    {"signer": wallet.pubkey(), "db_root": db_root_pda, "system_program": SYSTEM_PROGRAM_ID},
    {
        "db_root_id": db_root_id_bytes,
        "table_creators": [admin_wallet_1, admin_wallet_2],
        "ext_creators": [],
    },
)
```

Promote private → public:

```python
from iqlabs.contract import onboard_table_instruction

ix = onboard_table_instruction(
    builder,
    {"signer": wallet.pubkey(), "db_root": db_root_pda},
    {"db_root_id": db_root_id_bytes, "table_seed": b"my-board"},
)
```

#### `fetch_inventory_transactions(public_key, limit, before=None)`

```python
from iqlabs import reader
import json

my_files = await reader.fetch_inventory_transactions(my_pubkey, 20)
for tx in my_files:
    try:
        metadata = json.loads(tx['metadata'])
    except Exception:
        metadata = None

    if metadata and 'data' in metadata:
        inline = metadata['data'] if isinstance(metadata['data'], str) else json.dumps(metadata['data'])
        print(f"Inline data: {inline}")
    else:
        print(f"Signature: {tx['signature']}")
```

---

### Connections

#### `request_connection(connection, signer, db_root_id, party_a, party_b, table_name, columns, id_col, ext_keys)`

```python
from iqlabs import writer

await writer.request_connection(
    connection, signer, 'my-db',
    my_wallet_address, friend_wallet_address,
    'dm_table', ['message', 'timestamp'], 'message_id', []
)
```

#### `manage_connection` (contract-level — no high-level wrapper)

```python
from iqlabs import contract

builder = contract.create_instruction_builder()

approve_ix = contract.manage_connection_instruction(
    builder,
    {"db_root": db_root, "connection_table": connection_table, "signer": my_pubkey},
    {"db_root_id": db_root_id, "connection_seed": connection_seed,
     "new_status": contract.CONNECTION_STATUS_APPROVED}
)

block_ix = contract.manage_connection_instruction(
    builder,
    {"db_root": db_root, "connection_table": connection_table, "signer": my_pubkey},
    {"db_root_id": db_root_id, "connection_seed": connection_seed,
     "new_status": contract.CONNECTION_STATUS_BLOCKED}
)
```

#### `read_connection(db_root_id, party_a, party_b)`

| **Returns** | dict with `status`, `requester`, `blocker` |
|---|---|

```python
from iqlabs import reader

conn_info = await reader.read_connection('my-db', party_a, party_b)
print(conn_info['status'])  # 'pending' | 'approved' | 'blocked'
```

#### `write_connection_row(connection, signer, db_root_id, connection_seed, row_json)`

```python
from iqlabs import writer
import json

await writer.write_connection_row(
    connection, signer, 'my-db', connection_seed,
    json.dumps({"message_id": "123", "message": "Hello friend!", "timestamp": 1234567890})
)
```

#### `fetch_user_connections(user_pubkey, limit=None, before=None, speed=None)`

| **Returns** | list of connection dicts with `db_root_id`, `connection_pda`, `party_a`, `party_b`, `status`, `requester`, `blocker`, `timestamp` |
|---|---|

```python
from iqlabs import reader

connections = await reader.fetch_user_connections(my_pubkey, speed='light', limit=100)
pending = [c for c in connections if c['status'] == 'pending']
friends = [c for c in connections if c['status'] == 'approved']
```

---

### User profile

#### `read_user_state(user_pubkey)`

| **Returns** | dict with `owner`, `metadata`, `total_session_files`, `profile_data` |
|---|---|

```python
from iqlabs import reader

user_state = await reader.read_user_state(user_pubkey)
print('Owner:', user_state['owner'])
print('Session files:', user_state['total_session_files'])
```

#### `read_inventory_metadata(tx_signature)`

```python
result = await reader.read_inventory_metadata(tx_signature)
print('Metadata:', result)
```

#### `get_session_pda_list(user_pubkey)`

```python
sessions = await reader.get_session_pda_list(user_pubkey)
for pda in sessions:
    print(pda)
```

---

### Encryption

#### `derive_x25519_keypair(sign_message)`

```python
from iqlabs import crypto

keypair = await crypto.derive_x25519_keypair(wallet.sign_message)
pub_hex = keypair['pub_key'].hex()
```

#### `dh_encrypt(recipient_pub_hex, plaintext)` / `dh_decrypt(priv_key, sender_pub_hex, iv_hex, ciphertext_hex)`

```python
from iqlabs import crypto

encrypted = crypto.dh_encrypt(recipient_pub_hex, b'secret message')
decrypted = crypto.dh_decrypt(
    recipient_priv_key,
    encrypted['sender_pub'], encrypted['iv'], encrypted['ciphertext']
)
print(decrypted.decode())
```

#### `password_encrypt(password, plaintext)` / `password_decrypt(password, salt_hex, iv_hex, ciphertext_hex)`

```python
encrypted = crypto.password_encrypt('my-password', b'secret data')
decrypted = crypto.password_decrypt(
    'my-password', encrypted['salt'], encrypted['iv'], encrypted['ciphertext']
)
```

#### `multi_encrypt(recipient_pub_hexes, plaintext)` / `multi_decrypt(priv_key, pub_key_hex, encrypted)`

```python
encrypted = crypto.multi_encrypt(
    [alice_pub_hex, bob_pub_hex, carol_pub_hex],
    b'group secret'
)
plaintext = crypto.multi_decrypt(alice_priv_key, alice_pub_hex, encrypted)
```

---

### Contract / PDA helpers

```python
from iqlabs import contract

program_id = contract.get_program_id()
db_root_pda = contract.get_db_root_pda(db_root_id, program_id)
table_pda = contract.get_table_pda(db_root_pda, table_seed, program_id)
user_pda = contract.get_user_pda(user_pubkey, program_id)
session_pda = contract.get_session_pda(user_pubkey, seq=0, program_id=program_id)
connection_pda = contract.get_connection_table_pda(db_root_pda, connection_seed, program_id)
```

---

### Utilities

#### `derive_dm_seed(user_a, user_b)`

Sorted lowercase + keccak256 — order doesn't matter.

```python
from iqlabs.sdk.utils.seed import derive_dm_seed

seed1 = derive_dm_seed(wallet_a, wallet_b)
seed2 = derive_dm_seed(wallet_b, wallet_a)
print(seed1 == seed2)  # True
```

#### `to_seed_bytes(value)`

64-char hex → hex bytes; otherwise keccak256.

```python
from iqlabs.sdk.utils.seed import to_seed_bytes
from solders.pubkey import Pubkey

seed_bytes = to_seed_bytes('my-custom-seed')
pda, bump = Pubkey.find_program_address([seed_bytes, other_seed], program_id)
```

---

## Cross-chain notes

This SDK targets **Solana only**. For EVM (Ethereum / Monad), use the TypeScript SDK `@iqlabs-official/ethereum-sdk`. The encryption wire format (X25519 / AES-GCM / PBKDF2) is identical across all SDKs and languages, so a ciphertext produced here can be decrypted by the TypeScript SDK and vice versa with the matching key.

- **Solana TS:** `fetch_skill("solana")` or https://iqlabs.dev/skills/solana.md
- **Ethereum (Sepolia):** `fetch_skill("ethereum")` or https://iqlabs.dev/skills/ethereum.md
- **Monad:** `fetch_skill("monad")` or https://iqlabs.dev/skills/monad.md
