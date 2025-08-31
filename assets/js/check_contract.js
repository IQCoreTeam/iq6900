var clicked = false;
const Q_ADDRESS = "CevDzPg1xRE7P2TXo6z2s5fbYVUT6Q2oCPHMch3AeBvG";
const MAXCOUNT = 12;
const MAXLIST = 4;
let imported_signature = []
let imported_diary_signature = []
// import { BrowserSDK, AddressType, NetworkId } from "@phantom/browser-sdk";
// const ptSdk = new phantomwalletSdk.BrowserSDK({
//     providerType: "injected",
//     addressTypes: [AddressType.solana],
// });

// DBPDA를 요청하는 함수
async function getDBPDA(userKey) {
    try {
        const response = await fetch(host + `/getDBPDA/${userKey}`);
        const data = await response.json();
        if (response.ok) {
            return data;
        } else {
            throw new Error(data.error || 'Failed to fetch DBPDA');
        }
    } catch (error) {
        console.error('Error fetching DBPDA:', error);
    }
}

async function getCacheFromServer(txId, merkleRoot) {
    const url = `${host}/getCache?txId=${encodeURIComponent(txId)}&merkleRoot=${encodeURIComponent(merkleRoot)}`;
    try {
        const response = await fetch(url);
        if (response.ok) {
            return await response.text();
        } else {
            console.error('Error fetching cache data:', response.statusText);
            return null;
        }
    } catch (error) {
        console.error('Request failed:', error);
        return null;
    }
}

async function getCacheListFromServer(targetAddress, category, lastBlock = 9999999999) {
    const url = new URL(host + "/getTxList"); // 서버 URL
    const params = {
        targetAddress: targetAddress,
        category: category,
        lastBlock: lastBlock,
    };
    // URL에 쿼리 파라미터 추가
    Object.keys(params).forEach(key => url.searchParams.append(key, params[key]));
    try {
        const response = await fetch(url, {
            method: "GET", // GET 요청
            headers: {
                "Content-Type": "application/json", // JSON 형식
            },
        });

        if (!response.ok) {
            throw new Error(`Error: ${response.statusText}`);
        }
        return await response.json();
    } catch (error) {
        console.error("Failed to get Txlist:", error.message);
        throw error;
    }
}

async function getTransactionInfoOnServerResult(txId) {
    try {
        const response = await fetch(host + `/get_transaction_result/${txId}`);
        if (response.ok) {
            try {
                const data = response.text();

                return data;
            } catch (error) {
                console.error("Error creating transaction:", error);
                return null;
            }
        }
    } catch (error) {
        console.error("Error creating initTransactionOnServer:", error);
        return null;
    }
}

async function getTransactionInfoOnServer(txId) {
    try {
        const response = await fetch(host + `/get_transaction_info/${txId}`);
        if (response.ok) {
            try {
                const data = await response.json();

                return data.argData;
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

const updateTxListToServer = async (targetAddress, category) => {
    const url = host + "/update-tx-list"; // 서버 URL

    const requestData = {
        targetAddress: targetAddress,
        category: category,
    };

    try {
        const response = await fetch(url, {
            method: "POST", // POST 요청
            headers: {
                "Content-Type": "application/json", // JSON 형식
            },
            body: JSON.stringify(requestData), // 요청 본문에 데이터 전송
        });

        if (!response.ok) {
            throw new Error(`Error: ${response.statusText}`);
        }

        return await response.json(); // 응답 데이터 반환
    } catch (error) {
        console.error("Failed to update transaction list:", error.message);
        throw error; // 오류 처리
    }
};

async function _getTransactionData(transactionData) {
    if ('code' in transactionData) {
        console.log(transactionData.method);
        const encodedChunk = {
            code: transactionData.code,
            method: transactionData.method,
            decode_break: transactionData.decode_break,
        };
        const result = {
            data: encodedChunk,
            before_tx: transactionData.before_tx,
        };
        return result;
    } else {
        console.log(transactionData)
    }
}

function processString(input) {
    const closingBracketIndex = input.indexOf(']');
    if (closingBracketIndex === -1) {
        return {
            header: null,
            content: input
        };
    }
    const header = input.slice(0, closingBracketIndex);
    const content = input.slice(closingBracketIndex + 1);

    return {
        header: header,
        content: content
    };
}

function extractValue(text, key) {
    const regex = new RegExp(`${key}:\\s*(\\d+)`); // key와 숫자 값을 찾는 정규식
    if (text == undefined) return false;

    const match = text.match(regex); // 정규식으로 매칭
    if (match && match[1]) {
        return parseInt(match[1], 10); // 숫자형으로 변환
    }
    return false; // 값이 없으면 null 반환
}

function convertTextToEmoji(text) {
    return text.replace(/\/u([0-9A-Fa-f]{4,6})/g, (match, code) => {
        return String.fromCodePoint(parseInt(code, 16));
    });
}

async function addLines(beforeStr, width) {
    let result = '';
    for (let i = 0; i < beforeStr.length; i += width) {
        result += beforeStr.slice(i, i + width) + '\n';
    }
    return result
}

async function chunkDecode(chunks) {
    let compressedText = "";
    let method = "";
    let resultText = "";
    for (const chunk of chunks) {
        console.log(chunk.code);
        if (chunk.code) {
            compressedText += chunk.code;
            method = chunk.method;
            if (chunk.decode_break == 1) {
                const decodedTxt = await decompressText(compressedText, method)
                resultText += decodedTxt;
                compressedText = "";
            }
        }
    }

    return resultText;
}

function isMerkleRoot(str) {
    const base58Alphabet = /^[1-9A-HJ-NP-Za-km-z]+$/;
    return base58Alphabet.test(str) && str.length === 44;
}

async function bringCode(dataTxid) {
    const txInfo = await getTransactionInfoOnServer(dataTxid);
    const blockTime = txInfo.blockTime;
    const tail_tx = txInfo.tail_tx;
    const offset = txInfo.offset;
    const type_field = txInfo.type_field;
    //console.log(txInfo)

    const encodedChunks = []
    let before_tx = tail_tx;
    if (type_field) {
        if (type_field === "q_image" || type_field === "image" || type_field === "test_image") {
            let result = "";
            if (isMerkleRoot(offset)) {
                result = await getCacheFromServer(dataTxid, offset);
            } else {
                result = await getTransactionInfoOnServerResult(dataTxid);
            }
            if (!result) {
                return false;
            }
            let width = extractValue(offset, 'width');
            if (width !== false) {
                finalresult = await addLines(result, width);
            } else {
                const header_check = processString(result);
                if (header_check.header == null) {
                   // return false;
                    finalresult = "Some transactions were dropped. Please try again"
                    width = 30
                }else {
                    width = extractValue(header_check.header, 'width');
                }
                if (!header_check.content.includes("\n")) {
                    finalresult = await addLines(header_check.content, width);
                } else {
                    finalresult = header_check.content
                }
            }

            const asciiObj = {
                ascii_string: finalresult,
                width: width,
                type: type_field,
            };
            return asciiObj;

        } if (type_field === 'base64') {
            let result = "";
            if (isMerkleRoot(offset)) {
                result = await getCacheFromServer(dataTxid, offset);
            } else {
                result = await getTransactionInfoOnServerResult(dataTxid);
            }
            const base64Obj = {
                base64Str: result,
                type: type_field
            };
            return base64Obj;

        }else if(type_field === 'text'){
            let result = "";
            if (isMerkleRoot(offset)) {
                result = await getCacheFromServer(dataTxid, offset);
            } else {
                result = await getTransactionInfoOnServerResult(dataTxid);
            }
            const textObj = {
                text_string: result,
                type: type_field,
            };
            return textObj;
        }
        else {
            let result = "";
            if (isMerkleRoot(offset)) {
                result = await getCacheFromServer(dataTxid, offset);
            } else {
                result = await getTransactionInfoOnServerResult(dataTxid);
            }
            const width = 0;
            let finalResult = convertTextToEmoji(result); // does not work for base64 file type

            const textObj = {
                text_string: finalResult,
                width: width,
                type: type_field
            };
            return textObj;
        }
    } else {
        return false;
    }

}

async function bringType(dataTxid) {
    const txInfo = await getTransactionInfoOnServer(dataTxid);
    if (txInfo === undefined) {
        return false;
    }
    const tail_tx = txInfo.tail_tx;
    const type_field = txInfo.type_field;
    if (type_field === undefined) {
        return false;
    }
    return type_field;
}

async function fetchDataSignatures(address, before = null, limit = MAXCOUNT) {
    const connection = new solanaWeb3.Connection(network);
    let new_before = null;
    try {
        const signatures = await connection.getSignaturesForAddress(address, {
            before: before,
            limit: limit,
        });

        new_before = signatures[signatures.length - 1];
        if (new_before != null) {
            new_before = new_before.signature;
        }
        for (let i = 0; i < signatures.length; i++) {
            const type = await bringType(signatures[i].signature);
            if (type !== false) {
                if (!imported_signature.includes(signatures[i].signature)) {
                    imported_signature.push(signatures[i].signature);
                }
            }
        }
        return new_before;

    } catch (error) {
        console.error("Error fetching signatures:", error);
        return [];
    }
}


async function getAfterValues(array, value, MAX = MAXCOUNT) {
    const _array = Array.from(array);
    const index = _array.indexOf(value);
    if (index === -1) return [];

    const start = Math.max(0, index - MAX);
    return _array.slice(start, index);
}

async function getOldValues(array, value, MAX = MAXCOUNT) {
    const index = array.indexOf(value);
    if (index === -1) return [];

    return array.slice(index + 1, index + 1 + MAX);
}

async function bringAfter(target, type, datapoint) {

    const signatures = await getAfterValues(imported_signature, datapoint);
    $(".go_recent").off('click')
    if (signatures.length > 0) {
        $('.transactions_div').empty();
        await makeTxItems(signatures);
        const lastPValue = $('.transactions_div  .transaction_div:last  .transaction:last .hidden_txt').text();
        const firstPValue = $('.transactions_div .transaction_div:first .transaction:first .hidden_txt').text();

        if (imported_signature[0] === firstPValue) {
            $(".go_recent").css("opacity", "0.3");
            const pagenum = $(".current").text();
            $(".current").text(parseInt(pagenum) - 1)

        } else {
            const pagenum = $(".current").text();
            $(".current").text(parseInt(pagenum) - 1)

            $(".go_recent").css("cursor", "pointer");
            $(".go_recent").off('click').on('click', async function () {
                await bringAfter(target, type, firstPValue);
            });
        }

        $(".go_old").css("cursor", "pointer");
        $(".go_old").off('click').on('click', async function () {
            await bringOldCache(target, type, lastPValue);
        });
        $(".go_old").css("opacity", "1");
    } else {
        $(".go_recent").css("opacity", "0.3");
    }
}


async function fetchAll(type) {
    imported_signature = new Set(); // ✅ 중복 방지용 Set 사용
    let IQContractKeyString = "GbgepibVcKMbLW6QaFrhUGG34WDvJ2SKvznL2HUuquZh";
    let lastBlock = 999999999999;
    let hasMoreData = true;

    while (hasMoreData) {
        try {
            const list = await getCacheListFromServer(IQContractKeyString, type, lastBlock);
            console.log("Fetched list:", list);

            if (!list || !Array.isArray(list)) {
                console.error("Error: list is undefined or not an array");
                break;
            }

            if (list.length > 0) {
                list.forEach(item => imported_signature.add(item._id));
                lastBlock = list[list.length - 1].block_time;
                console.log("Updated lastBlock:", lastBlock);

                if (list.length < 100) {
                    hasMoreData = false;
                }
            } else {
                hasMoreData = false;
            }
        } catch (error) {
            console.error("Error fetching data:", error);
            hasMoreData = false;
        }
    }

    console.log("All data fetched:", Array.from(imported_signature));
}

async function bringOldCache(targetAddress, type, before) {

    const signatures = await getOldValues(Array.from(imported_signature), $('.transactions_div  .transaction_div:last  .transaction:last .hidden_txt').text());
    if (signatures.length > 0) {
        $('.transactions_div').empty();

        await makeTxItems(signatures);
        const pagenum = $(".current").text();
        $(".current").text(parseInt(pagenum) + 1)


        $(".go_old").off('click').on('click', async function () {
            await bringOldCache(targetAddress, type, imported_signature[imported_signature.length - 1]);
        });

        $(".go_old").css("cursor", "pointer");
        $(".go_old").css("opacity", "1");


        $(".go_recent").css("opacity", "1");
        $(".go_recent").css("cursor", "pointer");
        $(".go_recent").off('click').on('click', async function () {
            await bringAfter(targetAddress, type,
                $('.transactions_div .transaction_div:first .transaction:first .hidden_txt').text()
            );
        });
    } else {
        $(".go_old").css("opacity", "0.3");
    }
}

let isFetching = 0;
let isFetchingDiary = 0;
async function bringOldCacheFeed(targetAddress, type) {
    const signatures = await getOldValues(Array.from(imported_signature), $('.feed_div:last .tx_id').text(), MAXLIST);
    if (isFetching || !signatures.length > 0) {
        return
    }
    $(".loading_mini").css("display", "flex");
    isFetching = 1;
    await makeFeed(signatures);
    isFetching = 0;
    $(".loading_mini").css("display", "none");
}

async function bringOldCacheDiary(targetAddress, type) {
    const signatures = await getOldValues(Array.from(imported_diary_signature), $('.diary_div:last .diary_tx').text(), MAXLIST);
    console.log("start loading diary");
    if (isFetchingDiary){
        return
    }
    if (!signatures.length > 0) {
        console.log("no more diary check last tx");
        console.log($('.diary_div:last .diary_tx').text());
        return
    }
    isFetchingDiary = 1;
    await makeDiary(signatures);
    isFetchingDiary = 0;
}
async function bringOld(db_pda_address, before) {
    let new_old = null;
    $(".go_old").off('click');

    $(".go_old").css("opacity", "0.3");

    const lastPValue = $('.transactions_div  .transaction_div:last  .transaction:last .hidden_txt').text();
    const lastElement = imported_signature[imported_signature.length - 1];

    if (lastPValue === lastElement && before != null) {
        $(".transactions_div").css("display", "none");
        $(".loading_mini").css("display", "flex");

        new_old = await fetchDataSignatures(db_pda_address, before);
        console.log(new_old);
        $(".transactions_div").css("display", "flex");
        $(".loading_mini").css("display", "none");
    }
    const signatures = await getOldValues(imported_signature, lastPValue)
    if (signatures.length > 0) {
        $('.transactions_div').empty();

        await makeTxItems(signatures);
        const pagenum = $(".current").text();
        $(".current").text(parseInt(pagenum) + 1)

        if (signatures.length === MAXCOUNT) {
            $(".go_old").off('click').on('click', async function () {
                await bringOld(db_pda_address,
                    $('.transactions_div .transaction_div:last .transaction:last .hidden_txt').text()
                );
            });
            $(".go_old").css("cursor", "pointer");
            $(".go_old").css("opacity", "1");

        } else {
            $(".go_old").css("opacity", "0.3");

        }
        $(".go_recent").css("opacity", "1");
        $(".go_recent").css("cursor", "pointer");
        $(".go_recent").off('click').on('click', async function () {
            await bringAfter(
                $('.transactions_div .transaction_div:first .transaction:first .hidden_txt').text()
            );
        });

    } else {
        $(".go_old").css("opacity", "0.3");

    }

}
async function makeDiary(signatures) {

    let $DiaryDivElement = $('.diary_list_div');

    if ($DiaryDivElement.length === 0) {
        $DiaryDivElement = $('<div>').addClass('diary_list_div');
        $('.diary_root_div').append($DiaryDivElement);
    }

    for (const txId of signatures) {
        const item = await bringCode(txId);
        const jsonObject = JSON.parse(item.ascii_string);

        const date = jsonObject.date;
        const diary = jsonObject.diary;

        const $diaryElement = $('<div>').addClass('diary_div');
        $diaryElement.append($('<p>').addClass('diary_date').text("Date: " + date));
        $diaryElement.append($('<pre>').addClass('diary').text("diary:\n " + diary));
        $diaryElement.append($('<pre>').addClass('diary_tx tx_id').text(txId)); // 중복 addClass 개선

        const $bottomFeedElement = $('<pre>').addClass('bottom_feed_links').append(
            $('<a>')
                .addClass('bottom_links')
                .text('solscan')
                .attr('href', "https://solscan.io/tx/" + txId)
                .attr('target', '_blank')
        );

        $diaryElement.append($bottomFeedElement);
        $DiaryDivElement.append($diaryElement);
    }
}

async function makeFeed(signatures) {
    let $transactionDivElement = $('<div>').addClass('feeds_div'); // 새 그룹 생성

    for (const txid of signatures) {
        const item = await bringCode(txid);

        const jsonObject = JSON.parse(item.ascii_string);

        const handle = jsonObject.handle;
        const text = jsonObject.text;
        const image = jsonObject.image;
        const q_reply = jsonObject.q_reply;
        let tweet_link = jsonObject.tweet_link;
        const activeTabId = $(".q_tab.active").attr("id");

        if (activeTabId === "btn_pfp") {
            tweet_link = "https://x.com/" + handle
        }

        let $transactionElement = $('<div>').addClass('feed_div');
        $transactionElement.append($('<p>').addClass('feed_handle').text("handle: " + handle));
        $transactionElement.append($('<pre>').addClass('feed_text').text("text:\n " + text));
        $transactionElement.append($('<pre>').addClass('feed_tx').addClass('tx_id').text(txid));

        if (image !== "") {
            const imgData = await bringCode(image);
            const $imageElement = $('<pre>')
                .addClass('feed_image')
                .text(imgData.ascii_string)
            const fontsize = $('.q_menu_div').width() / parseInt(imgData.width);
            $imageElement.css("font-size", fontsize.toString() + "px");
            $transactionElement.append($imageElement);
        }
        $transactionElement.append($('<pre>').addClass('feed_reply').text("q_reply:\n " + q_reply));
        const $bottomFeedElement = $('<pre>')
            .addClass('bottom_feed_links')
        $bottomFeedElement.append(
            $('<a>')
                .addClass('bottom_links')
                .text('solscan')
                .attr('href', "https://solscan.io/tx/" + txid)
                .attr('target', '_blank')
        );
        if (tweet_link && tweet_link.startsWith('https://x.com')) {

            $bottomFeedElement.append(
                $('<a>')
                    .addClass('bottom_links')
                    .text('tweet')
                    .attr('href', tweet_link)
                    .attr('target', '_blank')
            );
        }
        $transactionElement.append($bottomFeedElement);

        $transactionDivElement.append($transactionElement);
        $('.transactions_div').append($transactionDivElement);
    }
}

async function makeTxItems(signatures) {
    let count = 0;
    let index = 0;
    let $transactionDivElement = $('<div>').addClass('transaction_div').addClass('row_flex'); // 새 그룹 생성

    $('.transactions_div').empty();
    signatures.forEach(txid => {
        let $transactionElement = $('<div>')
            .addClass('transaction')
            .on('click', async function (event) {
                await clickItems(event); // event 전달
            });
        $transactionElement.append(
            $('<p>').addClass('sig_title').text("Sig:")
        );
        $transactionElement.append(
            $('<p>').addClass('hidden_txt').text(txid)
        );
        if (Mobile()) {
            $transactionElement.append(
                $('<p>').addClass('signature').text("***" + txid.slice(-6))
            );
        } else {
            $transactionElement.append(
                $('<p>').addClass('signature').text(txid)
            );
        }

        let $bottomDiv = $('<div>').addClass('transaction_bottom_div');

        $bottomDiv.append(
            $('<p>').addClass('date').text("")
        );
        let $copyIcon = $('<img>')
            .addClass('copy')
            .attr('src', 'img/copy_icon.svg')
            .attr('alt', 'copy')
            .on('click', function (event) {
                event.stopPropagation(); // 부모 div의 클릭 이벤트 방지
                navigator.clipboard.writeText(txid).then(() => {
                    alert('Copied: ' + txid);
                }).catch(err => {
                    console.error('Copy failed', err);
                });
            });
        $bottomDiv.append($copyIcon);
        $transactionElement.append($bottomDiv);
        $transactionDivElement.append($transactionElement);
        count++;
        index++;
        if (count === 4 || index === imported_signature.length) {
            $('.transactions_div').append($transactionDivElement); // 기존 그룹을 추가
            $transactionDivElement = $('<div>').addClass('transaction_div').addClass('row_flex');
            count = 0; // 카운트 초기화
        }
    });
}

async function clickItems(event) {
    const tx = $(event.currentTarget).find('.hidden_txt').text().trim();
    if (!tx) {
        console.error("❌ Transaction ID not found!");
        return;
    }
    await seeTransaction(tx);
}


async function bringDataLive(targetAddress, menu) {
    $(".bump").css("display", "none");
    try {
        $(".goto_all_records").css("display", "flex");
        $(".see_code_in").css("display", "none");
        $(".loading").css('display', 'flex');

        imported_signature = []
        //imported_diary_signature = []
        const list = await getCacheListFromServer(targetAddress, menu);

        if (menu === "q_research" || menu === "pfp-in") {
            if (Array.isArray(list)) {
                for (const item of list) {
                    if (item._id) {
                        imported_signature.push(item._id);
                    }
                }
            }
            if (Array.isArray(imported_signature) && imported_signature.length === 0) {
                $(".loading").css('display', 'none');
                alert("You haven't coded in yet.");
                return false;
            }
            await makeFeed(imported_signature.slice(0, MAXLIST));

        } else if (menu === "q_diary") {
            if (Array.isArray(list)) {
                for (const item of list) {
                    if (item._id) {
                        imported_diary_signature.push(item._id);
                    }
                }
            }
            await makeDiary(imported_diary_signature.slice(0, MAXLIST));
        }


        $(".coded_in_text").css("display", "none");
        $(".see_code_in").css("display", "none");
        $(".records_list").css("display", "flex");

        $(".loading").css('display', 'none');

    } catch (err) {
        console.error(err);
    }
}

async function bringDataHandler(targetAddress, menu) {
    $(".bump").css("display", "none");
    try {
        $(".goto_all_records").css("display", "flex");
        $(".see_code_in").css("display", "none");
        $(".loading").css('display', 'flex');

        imported_signature = []
        const list = await getCacheListFromServer(targetAddress, menu);

        if (Array.isArray(list)) {
            for (const item of list) {
                if (item._id) {
                    imported_signature.push(item._id);
                }
            }
        }

        if (Array.isArray(imported_signature) && imported_signature.length === 0) {
            $(".loading").css('display', 'none');
            alert("You haven't coded in yet.");
            return false;
        }
        await makeTxItems(imported_signature.slice(0, MAXCOUNT));


        $(".coded_in_text").css("display", "none");
        $(".see_code_in").css("display", "none");
        $(".records_list").css("display", "flex");

        $(".loading").css('display', 'none');

        $(".go_old").on('click', async function () {
            await bringOldCache(targetAddress, menu, imported_signature[imported_signature.length - 1]);
        });

        $(".go_old").css("opacity", "1");

    } catch (err) {
        console.error(err);
    }

}


async function publicSearch() {
    try {
        let IQContractKeyString = "GbgepibVcKMbLW6QaFrhUGG34WDvJ2SKvznL2HUuquZh";
        await bringDataHandler(IQContractKeyString, "SolanaInternet");
    } catch (err) {
        console.error(err);
    }
}

async function q_diary() {
    try {
        await bringDataLive(Q_ADDRESS, "q_diary");
    } catch (err) {
        console.error(err);
    }
}

async function q_screen_research() {
    try {
        await bringDataLive(Q_ADDRESS, "q_research");
    } catch (err) {
        console.error(err);
    }
}

async function q_screen_pfp() {
    try {
        await bringDataLive(Q_ADDRESS, "pfp-in");
    } catch (err) {
        console.error(err);
    }
}

async function walletSearch(address = "") {
    $(".bump").css("display", "none");
    try {
        if (address == "") {
            address = $("#search").val();
        }
        $(".goto_all_records").css("display", "flex");
        $(".see_code_in").css("display", "none");

        $(".loading").css('display', 'flex');
        imported_signature = []
        let useKeyString;
        if (address === "") {
            const provider = ptSdk;
            const resp = await provider.connect();
            const userKey = await resp.publicKey;
            useKeyString = userKey.toString();
        } else {
            useKeyString = address;
        }

        const db_pda = await getDBPDA(useKeyString);
        if (db_pda === undefined) {
            $(".loading").css('display', 'none');
            alert("You haven't coded in yet.");
            return false;
        }

        const db_pda_address = new solanaWeb3.PublicKey(db_pda.DBPDA);

        const before = await fetchDataSignatures(db_pda_address);
        if (Array.isArray(imported_signature) && imported_signature.length === 0) {
            $(".loading").css('display', 'none');
            alert("You haven't coded in yet.");
            return false;
        }


        await makeTxItems(imported_signature)

        $(".coded_in_text").css("display", "none");
        $(".see_code_in").css("display", "none");
        $(".records_list").css("display", "flex");

        $(".loading").css('display', 'none');

        $(".go_old").on('click', async function () {
            await bringOld(db_pda_address, before);
        });

        $(".go_old").css("opacity", "1");

    } catch (err) {
        console.error(err);
    }
}

function Mobile() {
    return window.matchMedia("(max-width: 650px)").matches;
}

function createTwitterIntent(text) {
    const baseUrl = "https://twitter.com/intent/tweet";
    const encodedText = encodeURIComponent(text); // 텍스트를 URL에 사용할 수 있도록 인코딩
    return `${baseUrl}?text=${encodedText}`;
}

async function seeTransaction(txid) {
    $(".bump").css("display", "none");
    $(".coded_in_ascii").text("");
    $(".coded_in_text").text("");
    $(".records_list").css("display", "none");
    $(".loading").css("display", "flex");

    const asciiObj = await bringCode(txid);
    if (asciiObj === false) {
        $(".loading").css("display", "none");

        const _ascii_string = "404 not found";
        $(".coded_in_text").text(_ascii_string);
        $(".coded_in_text").css("display", "flex");
        $(".see_code_in").css("display", "flex");
        return false;
    }
    if (asciiObj.type == "image" || asciiObj.type == "test_image") {
        $(".loading").css("display", "none");
        $(".coded_in_ascii").css("display", "flex");
        const fontsize = $(".coded_in_ascii").width() / parseInt(asciiObj.width);
        const asciiHeight = asciiObj.ascii_string.split("\n").length;
        const aspectRatio = asciiObj.width / asciiHeight;

        $(".record").css("font-size", fontsize.toString() + "px");
        // we need to set font size to parent for set the 'em' letter space
        $(".coded_in_ascii").css("aspect-ratio", aspectRatio);
        $(".coded_in_ascii").text(asciiObj.ascii_string);
        $(".see_code_in").css("display", "flex");

    } else if (asciiObj.type === "love_letter") {
        $(".loading").css("display", "none");
        const jsonObject = JSON.parse(asciiObj.ascii_string);
        $(".from").text(jsonObject.from);
        $(".to").text(jsonObject.to);
        $(".message").text(jsonObject.message);
        $(".love_letter").css("display", "flex");
        $(".see_code_in").css("display", "flex");
    } else {
        $(".loading").css("display", "none");
        $(".coded_in_text").css("display", "flex");
        $(".coded_in_text").text(asciiObj.text_string);
        $(".see_code_in").css("display", "flex");
    }

    $('.coded_page_tx_id').text("***" + txid.slice(-6));

    $('.x_btn').css('display', 'flex');
    $('.sol_scan').css('display', 'flex');

    const _post_contant = "Coded-In @IQ6900_\n" +
        "\n" +
        "This record will remain on the solana blockchain forever\n" +
        "\n" +
        "Check: https://iq6900.com?txid=" + txid;

    const twitterIntentUrl = createTwitterIntent(_post_contant);
    $(".x_btn").off("click").on("click", function () {
        window.open(twitterIntentUrl, '_blank');
    });

    const solscanLink = "https://solscan.io/tx/" + txid;
    $(".sol_scan").off("click").on("click", function () {
        window.open(solscanLink, '_blank');
    });


}



