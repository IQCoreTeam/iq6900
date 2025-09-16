const host = "https://iq6900-backend-381334931214.asia-northeast3.run.app";
const network = "https://mainnet.helius-rpc.com/?api-key=ab814e2b-59a3-4ca9-911a-665f06fb5f09";
// import { BrowserSDK, AddressType, NetworkId } from "@phantom/browser-sdk";
// const ptSdk = new phantomwalletSdk.BrowserSDK({
//     providerType: "injected",
//     addressTypes: [AddressType.solana],
// });

const contractChunkSize = 850;
const sizeLimitForSplit = 10000;
const textInLimit = 15000;

//
function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
}


function getByteLength(text) {
    const encoder = new TextEncoder(); // UTF-8로 변환
    const encodedText = encoder.encode(text); // 바이트 배열 생성
    return encodedText.length; // 바이트 배열의 길이 반환
}

function emojiToText(message) {
    return message.replace(/([\uD800-\uDBFF][\uDC00-\uDFFF])/g, (match) => {
        const codePoint = match.codePointAt(0).toString(16).toUpperCase();

        return "//".slice(1)+`u${codePoint}`;
    });
}

async function _getChunk_ForText(message,chunkSize) {
    const encoder = new TextEncoder(); // 메시지를 UTF-8로 변환

    let chunks = [];
    let currentChunkStart = 0;
    let currentChunkBytes = 0;

    for (let i = 0; i < message.length; i++) {

        let charByteLength = encoder.encode(message[i]).length;
        currentChunkBytes += charByteLength;

        if (currentChunkBytes > chunkSize) {
            chunks.push(message.slice(currentChunkStart, i));
            currentChunkStart = i;
            currentChunkBytes = charByteLength;
        }
    }

    if (currentChunkStart < message.length) {
        chunks.push(message.slice(currentChunkStart)); // 나머지 문자열을 청크로 저장
    }

    return chunks;
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
    let width = $('#asciiWidth').text();
    let innerOffset = "[ width: " + width + " ]"
    let full_msg = innerOffset + $('.generate_result_txt').text();
    let ascii = full_msg.replace(/\n/g, "");  // 모든 \n을 빈 문자열로 대체

    textChunks = await _getChunk(ascii, sizeLimitForSplit);
    const merkleroot = await getMerkleRootFromServer(textChunks);

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
        merkleRoot: merkleroot,
    }
    return resultObj;
}

async function _translate_transaction(data) {
    const Buffer = buffer.Buffer;
    const transaction = new solanaWeb3.Transaction();
    console.log(data);
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
            const signature = await provider.signAndSendTransaction({
                networkId: window.NetworkId.SOLANA_MAINNET,
                transaction: transaction,
            });
            // // const signature = await provider.signAndSendTransaction(transaction);
            // if (typeof signature == 'string') {
            //     return signature;
            // } else if (typeof signature == 'object') {
            //     console.log(typeof signature.signature)
            //     return signature.signature;
            // }
            return signature.hash;
        } catch (err) {
            alert(err.name);
            alert(err.message);
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

async function createInitTransactionOnServer(userKeyString) {
    try {
        const response = await fetch(host + `/initialize-user/${userKeyString}`);
        if (response.ok) {
            try {

                const responseData = await response.json();
                const data = responseData;
                const transaction = await _translate_transaction(data.transaction);
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

async function getMerkleRootFromServer(dataList) {
    const url = host + "/generate-merkle-root"; // 서버 URL
    const requestData = {
        data: dataList, // 데이터 배열
    };
    try {
        const response = await fetch(url, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify(requestData),
        });

        if (!response.ok) {
            throw new Error(`Error: ${response.statusText}`);
        }

        const responseData = await response.json();
        console.log("Merkle Root:", responseData.merkleRoot);
        return responseData.merkleRoot;

    } catch (error) {
        console.error("Failed to get Merkle Root:", error.message);
        throw error;
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


async function makeTextTransactions(userKeyStr, chunkSize, chunkList, handle, type, offset) {
    let beforeHash = "Genesis";

    const totalSteps = chunkSize + 1;
    let current = 0;
    let method = 0;
    let decode_break = 0;
    let i = 0;
    await progress(current, totalSteps);

    for (let text of chunkList) {

        // createSendTransactionOnServer -> code trx
        const _Trx = await createSendTransactionOnServer(userKeyStr, text, beforeHash, method, decode_break);
        beforeHash = await _send_transaction(ptSdk, _Trx);
        current = current + 1;
        await progress(current, totalSteps);
    }

    // const provider = window.phantom.solana;
    const DBTrx = await createDbCodeTransactionOnserver(userKeyStr, handle, beforeHash, type, offset);
    const resultHash = await _send_transaction(ptSdk, DBTrx);

    await progress(totalSteps, totalSteps);
    await sleep(1000);

    return resultHash;
}


async function makeAllTransactions(userKeyStr, chunkSize, chunkList, handle, type, offset) {
    let beforeHash = "Genesis";

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
            // const provider = window.phantom.solana;
            if (i == textList.length - 1) {
                decode_break = 1;
            }
            if (i < textList.length) {
                const _Trx = await createSendTransactionOnServer(userKeyStr, text, beforeHash, method, decode_break);
                beforeHash = await _send_transaction(window.ptSdk, _Trx);

            } else {
                console.log("last_trx set the decodebreak");
                const _Trx = await createSendTransactionOnServer(userKeyStr, text, beforeHash, method, decode_break);
                console.log(_Trx)
                beforeHash = await _send_transaction(window.ptSdk, _Trx);
            }
            i += 1;
            current += 1;
            if (beforeHash === "error") {
                alert("error on transaction");
                return false;
            }
            await progress(current, totalSteps);
            await sleep(1000);
        }
    }
   // const provider = window.phantom.solana;

    const DBTrx = await createDbCodeTransactionOnserver(userKeyStr, handle, beforeHash, type, offset);
    const resultHash = await _send_transaction(window.ptSdk, DBTrx);

    await progress(totalSteps, totalSteps);
    await sleep(1000);
    return resultHash;
}
// async function LoveIn() {
//     if (window.solana && window.solana.isPhantom) {
//         try {
//             $('.info').text("");
//             $('.type_in').prop('disabled', true);
//             $('.code_in_button').css('display', 'none');
//             $('.progress_div').css("display", "flex");
//             const provider = await getProvider();
//             const resp = await provider.connect();
//             const connection = new solanaWeb3.Connection(network);
//             const userkey = await resp.publicKey;
//             const useKeyString = userkey.toString()
//             const handle = "anonymous"; // edit with twitter api
//             const from = $('.from').val();
//             const to = $('.to').val();
//
//             const message = $('.type_in').val();
//             const emoji_text = emojiToText(message)
//             const byteLength = getByteLength(message)
//
//             if (message === ''||from===''||to==='') {
//                 return false;
//             } else if (byteLength > textInLimit) {
//                 alert("Please Type less then: " + textInLimit.toString());
//                 alert("Your Text's length: " + byteLength);
//                 return false;
//             }
//             const letter = {
//                 from: from,
//                 to: to,
//                 message: emoji_text,
//             };
//             const jsonString = JSON.stringify(letter);
//
//             const chunks = await _getChunk_ForText(jsonString, contractChunkSize);
//             const chunkSize = chunks.length;
//
//             const merkleRoot = await getMerkleRootFromServer(chunks);
//             console.log(merkleRoot);
//             const offset = merkleRoot;
//             const dataType = "love_letter";
//             const result = await makeTextTransactions(useKeyString, chunkSize, chunks, handle, dataType, offset);
//             console.log(result);
//             let IQContractKeyString = "GbgepibVcKMbLW6QaFrhUGG34WDvJ2SKvznL2HUuquZh";
//             updateTxListToServer(IQContractKeyString, "love_letter")
//
//             $('.progress_div').css("display", "none");
//             $('.code_in_button_p').text("Check My Data");
//             $('.code_in_button').attr("onclick", "goto_viewer()");
//             $('.code_in_button').css("display", "block");
//             $('.info').html("Tx: "+result.slice(0,10)+"...<br> It might take about 2 minutes to fully get onto the block, Please wait and check.");
//
//         } catch (error) {
//             console.error("Error signing or sending transaction: ", error);
//         }
//     } else {
//         console.log("Phantom wallet is not connected.");
//     }
// }
async function textCodeIn() {
    if (window.solana && window.solana.isPhantom) {
        try {
            $('.info').text("");

            $('.type_in').prop('disabled', true);

            $('.code_in_button').css('display', 'none');
            $('.progress_div').css("display", "flex");
            // const provider = window.ptSdk;
            // const resp = await provider.connect();
            // const connection = new solanaWeb3.Connection(network);
            // const userkey = await resp.publicKey;
            // const useKeyString = userkey.toString()
            
            const provider = window.ptSdk;
            const { addresses } = await provider.connect();
            const userKey = new solanaWeb3.PublicKey(addresses[0].address);
            const useKeyString = userKey.toString();
            
            const handle = "anonymous"; // edit with twitter api

            const original_text = $('.type_in').val();
            const emoji_text = emojiToText(original_text)
            const byteLength = getByteLength(emoji_text)

            if (original_text === '') {
                return false;
            } else if (byteLength > textInLimit) {
                alert("Please Type less then: " + textInLimit.toString());
                alert("Your Text's length: " + byteLength);
                return false;
            }
            const chunks = await _getChunk_ForText(emoji_text, contractChunkSize);
            const chunkSize = chunks.length;

            const merkleRoot = await getMerkleRootFromServer(chunks);
            console.log(merkleRoot);
            const offset = merkleRoot;

            const dataType = "text";

            const result = await makeTextTransactions(useKeyString, chunkSize, chunks, handle, dataType, offset);
            console.log(result);
            let IQContractKeyString = "GbgepibVcKMbLW6QaFrhUGG34WDvJ2SKvznL2HUuquZh";
            updateTxListToServer(IQContractKeyString, "SolanaInternet")

            $('.progress_div').css("display", "none");
            $('.code_in_button_p').text("Check My Data");

            $('.code_in_button').attr("onclick", "goto_viewer()");

            $('.code_in_button').css("display", "block");
            $('.info').html("Tx: "+result.slice(0,10)+"...<br> It might take about 2 minutes to fully get onto the block, Please wait and check.");

        } catch (error) {
            console.error("Error signing or sending transaction: ", error);
        }
    } else {
        console.log("Phantom wallet is not connected.");
    }
}

async function asciiCodeIn() {
    if (window.solana && window.solana.isPhantom) {
        try {
            $('.info').text("");

            $('.font_manage').css('display', 'none');
            $('.after_gen').css('display', 'none');
            $('.re_gen').css('display', 'none');

            $('.progress_div').css("display", "flex");
            const provider = window.ptSdk;
            const { addresses } = await provider.connect();
            const userKey = new solanaWeb3.PublicKey(addresses[0].address);
            const useKeyString = userKey.toString();
            
            const handle = "anonymous"; // edit with twitter api

            let chunkObj = await _makeChunks();
            const chunkList = chunkObj.chunkList;
            const chunkSize = chunkObj.chunkSize;
            const offset = chunkObj.merkleRoot;

            console.log(offset)
            const dataType = "image";
            console.log("Chunk size: ", chunkSize);

            const result = await makeAllTransactions(useKeyString, chunkSize, chunkList, handle, dataType, offset);
            console.log(result);
            let IQContractKeyString = "GbgepibVcKMbLW6QaFrhUGG34WDvJ2SKvznL2HUuquZh";
            updateTxListToServer(IQContractKeyString, "SolanaInternet")

            $('.progress_div').css("display", "none");
            $('.code_in_button_p').text("Check My Data");
            $('.code_in_button').attr("onclick", "goto_viewer()");
            $('.after_gen').css("display", "flex");

            $('.info').html("Tx: "+result.slice(0,10)+"...<br> It might take about 2 minutes to fully get onto the block, Please wait and check.");


        } catch (error) {
            console.error("Error signing or sending transaction: ", error);
        }
    } else {
        console.log("Phantom wallet is not connected.");
    }
}


const getProvider = () => {
    // if ('phantom' in window) {
    //     const provider = ptSdk;
    //
    //     if (provider?.isPhantom) {
    //         return provider;
    //     }
    // }
    // window.open('https://phantom.app/', '_blank');
    return window.ptSdk;
};


async function pda_check(PDA) {
    try {
        const connection = new solanaWeb3.Connection(network);

        const accountInfo = await connection.getAccountInfo(PDA);
        return accountInfo;
    } catch (error) {
        console.error("PDA Check failed:", error);
    }
}

async function pda_make() {
    if (window.solana && window.solana.isPhantom) {
        try {
            const provider = window.ptSdk;
            const { addresses } = await provider.connect();

            const userKey = new solanaWeb3.PublicKey(addresses[0].address);
            const useKeyString = userKey.toString();
            // console.log(useKeyString)
            const transaction = await createInitTransactionOnServer(useKeyString)

            if (transaction != null) {

                const {signature} = await _send_transaction(window.ptSdk, transaction);
                //const status = await connection.getSignatureStatus(signature);

                alert("Registration is complete.\n Please wait for about a minute and then reconnect your wallet.")
                $.mainPage.init();
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

    const text = curruntSteps.toString() + " / " + totalSteps.toString();
    $(".progress_status").text("Processing.. [ " + text + " ]");
}


async function codeIn() {

    if ($("#checkbox_image").is(":checked")) {
        return await asciiCodeIn();
    } else {
        return await textCodeIn();
    }

}

async function Connect() {
    try {
        // $('.code_in_menu').css('display', 'flex');
        // $('.file-name').css('display', 'block');
        // $('.connect-btn').css('display', 'none');
    } catch (err) {
        console.error(err);
    }
}

async function nav_connect() {
    const provider = window.ptSdk;
  
    const { addresses } = await provider.connect();

    const userKey = new solanaWeb3.PublicKey(addresses[0].address);
    const useKeyString = userKey.toString();
    
    // const userKey = resp.publicKey;
    // const useKeyString = userKey.toString();
    const PDA = await getPDA(userKey);
    const PDAPubKey = new solanaWeb3.PublicKey(PDA);
    const userstatus = await pda_check(PDAPubKey);


    if (!userstatus) {
        alert("You need to sign up once for each wallet. Click the button below to sign up.");
        $(".before_connect").attr("onclick", "pda_make()");
        $('.nav_status_before_login').text("Sign Up");
    } else {
        $('.before_connect').css('display', 'none');
        if($('.mobile_bottom_nav').is(':hidden')){
            $('.wallet_address_in_btn').text(useKeyString.slice(0, 8) + "..");
        }else {
            $('.wallet_address_in_btn').text(useKeyString.slice(0, 4) + "..");
        }
        $('.after_connect').css('display', 'flex');
    }

}

async function init_connect() {
    const provider =ptSdk;
    provider.connect({onlyIfTrusted: true})
        .then(async ({publicKey}) => {
            const useKeyString = publicKey.toString();
            const PDA = await getPDA(publicKey);
            const PDAPubKey = new solanaWeb3.PublicKey(PDA);
            const userstatus = await pda_check(PDAPubKey);
            if (!userstatus) {
                alert("You need to sign up once for each wallet. Click the button below to sign up.");
                $('.before_connect').attr("onclick", "pda_make()");

                $('.nav_status_before_login').text("Sign Up");
            } else {
                $('.before_connect').css('display', 'none');
                if($('.mobile_bottom_nav').is(':hidden')){
                    $('.wallet_address_in_btn').text(useKeyString.slice(0, 8) + "..");
                }else {
                    $('.wallet_address_in_btn').text(useKeyString.slice(0, 4) + "..");
                }
                $('.after_connect').css('display', 'flex');
            }
        }).catch(() => {
        // Handle connection failure as usual
    })

}