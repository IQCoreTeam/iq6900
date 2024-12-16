const host = "https://solanacontractapi.uc.r.appspot.com";
const network = "https://devnet.helius-rpc.com/?api-key=ab814e2b-59a3-4ca9-911a-665f06fb5f09";

const contractChunkSize = 900;
const textChunkSize = 10000;
const textInLimit = 5000;
function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
}

async function _getChunk(message, chunkSize) {
    const msglength = message.length;
    const totalChunks = Math.ceil(msglength / chunkSize); // 전체 메시지를 몇 개의 청크로 나눠야 하는지 계산
    let chunks = [];
    for (let i = 0; i < totalChunks; i++) {
        const start = i * chunkSize;
        const end = Math.min(start + chunkSize, msglength);
        await chunks.push(message.slice(start, end));
    }
    if (chunks.length < 1) {
        return null;
    } else {
        return chunks;
    }
}


async function _makeChunks() {
    let textChunks = []
    let compressedChunks = []
    let totalChunks = []
    let chunkSize = 0;
    const full_msg = $('#ascii_text').text();
    textChunks = await _getChunk(full_msg, textChunkSize);
    for (let textChunk of textChunks) {
        let _compressChunk = await compressText(textChunk);
        compressedChunks.push(_compressChunk);
    }
    for (let compressChunk of compressedChunks) {
        let _contractchunks = await _getChunk(compressChunk.result, contractChunkSize);
        const chunkObj = {
            text_list: _contractchunks,
            method: compressChunk.method,//offset
        }
        await totalChunks.push(chunkObj);
        chunkSize += _contractchunks.length;
    }
    const resultObj = {
        chunkList: totalChunks,
        chunkSize: chunkSize,
    }
    return resultObj;
}

async function _translate_transaction(data) {
    const Buffer = buffer.Buffer;
    const transaction = new solanaWeb3.Transaction();
    const connection = new solanaWeb3.Connection(network);
    const latestBlockhash = await connection.getLatestBlockhash();
    transaction.recentBlockhash = latestBlockhash.blockhash; // 서버에서 받은 recentBlockhash
    transaction.feePayer = new solanaWeb3.PublicKey(data.feePayer); // 서버에서 받은 feePayer

    data.instructions.forEach((instr) => {
        const instruction = new solanaWeb3.TransactionInstruction({
            keys: instr.keys.map((key) => ({
                pubkey: new solanaWeb3.PublicKey(key.pubkey),
                isSigner: key.isSigner,
                isWritable: key.isWritable,
            })),
            programId: new solanaWeb3.PublicKey(instr.programId),
            data: instr.data,
        });
        transaction.add(instruction);
    });
    return transaction;

}

async function _send_transaction(provider, transaction) {
    if (transaction) {
        try {
            const signature = await provider.signAndSendTransaction(transaction);
            if (typeof signature == 'string') {
                return signature;
            } else if (typeof signature == 'object') {
                console.log(typeof signature.signature)
                return signature.signature;
            }
        } catch (err) {
            console.error("Error in _send_transaction:", err);
            return "error";
        }
    } else {
        console.error("transaction not found!");
        return "error";
    }
}

async function getPDA(userKey) {
    try {
        const response = await fetch(host + `/getPDA/${userKey}`);
        const data = await response.json();
        if (response.ok) {
            return data.PDA;
        } else {
            throw new Error(data.error || 'Failed to fetch PDA');
        }
    } catch (error) {
        console.error('Error fetching PDA:', error);
    }
}


async function pda_check(PDA) {
    try {
        const connection = new solanaWeb3.Connection(network);

        const accountInfo = await connection.getAccountInfo(PDA);
        return accountInfo;
    } catch (error) {
        console.error("PDA Check failed:", error);
    }
}

async function createInitTransactionOnServer(userKeyString) {
    try {
        const response = await fetch(host + `/initialize-user/${userKeyString}`);
        if (response.ok) {
            try {
                const responseData = await response.json();
                const data = responseData.transaction;
                const transaction = await _translate_transaction(data);
                return transaction;
            } catch (error) {
                console.error('Error creating transaction:', error);
                return null;
            }
        }
    } catch (error) {
        console.error('Error creating initTransactionOnServer:', error);
        return null;
    }
}


async function createSendTransactionOnServer(userKeyString, code, before_tx, method, decode_break) {
    const url = host + '/create-send-transaction'; // 서버 URL로 변경

    const requestData = {
        userKeyString,
        code,
        before_tx,
        method,
        decode_break,
    };
    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(requestData),
        });

        if (!response.ok) {
            throw new Error(`Error: ${response.statusText}`);
        }
        const data = await response.json();
        const transaction = await _translate_transaction(data.transaction);
        return transaction;

    } catch (error) {
        console.error("Failed to create transaction:", error.message);
        throw error;
    }
}


async function createDbCodeTransactionOnserver(userKeyString, handle, tail_tx, type, offset) {
    const url = host + '/create-db-code-transaction'; // 서버 URL로 변경
    const requestData = {
        userKeyString,
        handle,
        tail_tx,
        type,
        offset
    };
    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(requestData),
        });

        if (!response.ok) {
            throw new Error(`Error: ${response.statusText}`);
        }
        const data = await response.json();
        const transaction = _translate_transaction(data.transaction)
        return transaction;

    } catch (error) {
        console.error("Failed to create transaction:", error.message);
        throw error;
    }
}

async function pda_make() {
    if (window.solana && window.solana.isPhantom) {
        try {
            const provider = await getProvider();
            const resp = await provider.connect();
            const connection = new solanaWeb3.Connection(network);
            const userkey = resp.publicKey;
            const useKeyString = userkey.toString()

            const transaction = await createInitTransactionOnServer(useKeyString)
            if (transaction != null) {
                const {signature} = await provider.signAndSendTransaction(transaction);
                const status = await connection.getSignatureStatus(signature);
                location.reload();
            } else {
                console.log("Transaction build failed");
            }
        } catch (error) {
            console.error("Error signing or sending transaction: ", error);
    }
    } else {
        console.log("Phantom wallet is not connected.");
    }
}

async function progress(curruntSteps, totalSteps) {
    const percentage = (curruntSteps / totalSteps) * 100;
    $(".progress-bar").animate({width: `${percentage}%`}, 500);
    const text = curruntSteps.toString()+" / "+totalSteps.toString();
    $(".progress_num").text(text);
}

async function makeTextTransactions(userKeyStr, chunkSize, chunkList, handle, type, offset) {
    let beforeHash = "Genesis";
    $('.code-in-div').css('display', 'none');
    $('.progress_div').css("display", "flex");
    const totalSteps = chunkSize + 1;
    let current = 0;
    let method = 0;
    let decode_break = 0;
    let i = 0;
    await progress(current, totalSteps);
    for (let text of chunkList) {

        const provider = window.phantom.solana;
        const _Trx = await createSendTransactionOnServer(userKeyStr, text, beforeHash, method, decode_break);
        beforeHash = await _send_transaction(provider, _Trx);
        current = current + 1;
        progress(current, totalSteps);
    }

    const provider = window.phantom.solana;
    const DBTrx = await createDbCodeTransactionOnserver(userKeyStr, handle, beforeHash, type, offset);
    const resultHash = await _send_transaction(provider, DBTrx);

    await progress(totalSteps, totalSteps);
    await sleep(1000);

    return resultHash;
}

async function makeAllTransactions(userKeyStr, chunkSize, chunkList, handle, type, offset) {
    let beforeHash = "Genesis";
    $('.code-in-div').css('display', 'none');
    $('.progress_div').css("display", "flex");
    const totalSteps = chunkSize + 1;
    let current = 0;
    await progress(current, totalSteps);


    for (let chunks of chunkList) {
        let textList = chunks.text_list;
        let method = chunks.method;
        let decode_break = 0;
        let i = 0;

        for (let text of textList) {
            const provider = window.phantom.solana;
            if (i == textList.length -1){
                decode_break = 1;
            }
            if (i < textList.length) {
                const _Trx = await createSendTransactionOnServer(userKeyStr, text, beforeHash, method, decode_break);
                beforeHash = await _send_transaction(provider, _Trx);

            } else {
                console.log("last_trx set the decodebreak");
                const _Trx = await createSendTransactionOnServer(userKeyStr, text,beforeHash, method, decode_break);
                console.log(_Trx)
                beforeHash = await _send_transaction(provider, _Trx);
            }
            i += 1;
            current +=1;
            if (beforeHash ==="error"){
                alert("error on transaction");
                return false;
            }
            await progress(current, totalSteps);
            await sleep(1000);
        }
    }
    const provider = window.phantom.solana;

    const DBTrx = await createDbCodeTransactionOnserver(userKeyStr, handle, beforeHash, type, offset);
    const resultHash = await _send_transaction(provider, DBTrx);

    await progress(totalSteps, totalSteps);
    await sleep(1000);
    return resultHash;
}
async function OnChainTextIn() {
    if (window.solana && window.solana.isPhantom) {
        try {
            const provider = await getProvider();
            const resp = await provider.connect();
            const connection = new solanaWeb3.Connection(network);
            const userkey = await resp.publicKey;
            const useKeyString = userkey.toString()
            const handle = "anonymous"; // edit with twitter api

            const original_text = $('#text_input').val();
            console.log(original_text)
            if(original_text == ''){
                return false;
            }
            else if (original_text.length > textInLimit){
                alert("Please Type less then: "+textInLimit.toString());
                alert("Your Text's length: "+original_text.length);
                return false;
            }
            const chunks = await _getChunk(original_text,contractChunkSize);
            const chunkSize = chunks.length;

            const offset = "none";
           
            const dataType = "text";
           
            const result = await makeTextTransactions(useKeyString, chunkSize, chunks, handle, dataType, offset);
            const result_str = result.toString();
            
            const solscanLink = "https://solscan.io/tx/"+result_str+"?cluster=devnet";
            $('.sol_scan').prop('href',solscanLink)
            result_view = result_str.slice(0,9)+"..."+result_str.slice(-9);

            $('.result_txid').text('Coded In:'+result_view);
            $('.progress_div').css('display', 'none');
            $('.result_div').css('display', 'flex');

        } catch (error) {
            console.error("Error signing or sending transaction: ", error);
        }
    } else {
        console.log("Phantom wallet is not connected.");
    }
}
async function OnChainCodeIn() {
    if (window.solana && window.solana.isPhantom) {
        try {
            const provider = await getProvider();
            const resp = await provider.connect();
            const connection = new solanaWeb3.Connection(network);
            const userkey = await resp.publicKey;
            const useKeyString = userkey.toString()
            const handle = "anonymous"; // edit with twitter api

            let chunkObj = await _makeChunks();
            const chunkList = chunkObj.chunkList;
            const chunkSize = chunkObj.chunkSize;
            const width = $('#asciiWidth').text();

            const offset = "width: " + width.toString();
            console.log(offset)
            const dataType = "image";
            console.log("Chunk size: ", chunkSize);
            
            const result = await makeAllTransactions(useKeyString, chunkSize, chunkList, handle, dataType, offset);
            const result_str = result.toString();
            const solscanLink = "https://solscan.io/tx/"+result_str+"?cluster=devnet";
            $('.sol_scan').prop('href',solscanLink)
            result_view = result_str.slice(0,9)+"..."+result_str.slice(-9);

            $('.result_txid').text('Coded In:'+result_view);
            $('.progress_div').css('display', 'none');
            $('.result_div').css('display', 'flex');

        } catch (error) {
            console.error("Error signing or sending transaction: ", error);
        }
    } else {
        console.log("Phantom wallet is not connected.");
    }
}


const getProvider = () => {
    if ('phantom' in window) {
        const provider = window.phantom?.solana;

        if (provider?.isPhantom) {
            return provider;
        }
    }
    window.open('https://phantom.app/', '_blank');
};

async function Connect() {
    const provider = await getProvider();
    const resp = await provider.connect();
    const connection = new solanaWeb3.Connection(network);

    try {
        const userkey = resp.publicKey;
        const _PDA = await getPDA(userkey);
        const PDA = new solanaWeb3.PublicKey(_PDA);

        const userstatus = await pda_check(PDA);
        $('.connect-btn').css('display', 'none');
        if (!userstatus) {
            $('.sign-in-btn').css('display', 'flex');
        } else {
            $('.code-in-btn').css('display', 'flex');
        }

    } catch (err) {
        console.error(err);
    }
}