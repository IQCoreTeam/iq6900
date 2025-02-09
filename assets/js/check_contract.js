var clicked = false;
const MAXCOUNT = 12;
let imported_signature = []

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

async function bringCode(dataTxid) {
    const txInfo = await getTransactionInfoOnServer(dataTxid);

    const tail_tx = txInfo.tail_tx;
    const offset = txInfo.offset;
    const type_field = txInfo.type_field;

    const encodedChunks = []
    let before_tx = tail_tx;

    if (type_field == "image") {
        const result = await getTransactionInfoOnServerResult(dataTxid);

        let width = extractValue(offset, 'width');
        if (width !== false) {
            finalresult = await addLines(result, width);
        } else {
            const header_check = processString(result);
            width = extractValue(header_check.header, 'width');
            finalresult = await addLines(header_check.content, width);
        }

        const asciiObj = {
            ascii_string: finalresult,
            width: width,
            type: type_field,
        };
        return asciiObj;

    } else if (type_field === "text" || type_field === "json") {
        const result = await getTransactionInfoOnServerResult(dataTxid);
        const width = 0;
        const textList = encodedChunks.reverse();
        const textData = textList.join();
        let finalresult = convertTextToEmoji(textData);

        const asciiObj = {
            ascii_string: finalresult,
            width: width,
            type: type_field
        };
        return asciiObj;
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


async function getAfterValues(array, value) {
    const index = array.indexOf(value);
    if (index === -1) return [];

    const start = Math.max(0, index - MAXCOUNT);
    return array.slice(start, index);
}

async function getOldValues(array, value) {
    const index = array.indexOf(value);
    if (index === -1) return [];

    const end = Math.min(array.length, index + MAXCOUNT + 1);
    return array.slice(index + 1, end);
}

async function bringAfter(db_pda_address, datapoint) {
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
                await bringAfter(db_pda_address, firstPValue);
            });
        }

        $(".go_old").css("cursor", "pointer");
        $(".go_old").off('click').on('click', async function () {
            await bringOld(db_pda_address, lastPValue);
        });
        $(".go_old").css("opacity", "1");
    } else {
        $(".go_recent").css("opacity", "0.3");
    }
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
            await bringAfter(db_pda_address,
                $('.transactions_div .transaction_div:first .transaction:first .hidden_txt').text()
            );
        });

    } else {
        $(".go_old").css("opacity", "0.3");

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
        if ($(".after_connect:visible").length === 0) {
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
    console.log("Clicked TX:", tx); // 디버깅용 콘솔 로그
    if (!tx) {
        console.error("❌ Transaction ID not found!");
        return;
    }
    await seeTransaction(tx);
}

async function walletSearch(address = "") {

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
            const provider = await getProvider();
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


        // const _post_contant = "Coded-In @IQ6900_\n" +
        //     "\n" +
        //     "Check out my collection\n" +
        //     "This record will remain on the solana blockchain forever\n" +
        //     "\n" +
        //     "Check: https://iq6900.com?txid=" + useKeyString;
        //
        // const twitterIntentUrl = createTwitterIntent(_post_contant);
        // $(".x_my_wallet_btn").off("click").on("click", function () {
        //     window.open(twitterIntentUrl, '_blank');
        // });
        $(".loading").css('display', 'none');

        $(".go_old").on('click', async function () {
            await bringOld(db_pda_address, before);
        });

        $(".go_old").css("opacity", "1");

    } catch (err) {
        console.error(err);
    }
}

function createTwitterIntent(text) {
    const baseUrl = "https://twitter.com/intent/tweet";
    const encodedText = encodeURIComponent(text); // 텍스트를 URL에 사용할 수 있도록 인코딩
    return `${baseUrl}?text=${encodedText}`;
}

async function seeTransaction(txid) {
    $(".coded_in_ascii").text("");
    $(".coded_in_text").text("");
    $(".records_list").css("display", "none");
    $(".loading").css("display", "flex");

    const asciiObj = await bringCode(txid);
    if (asciiObj == false) {
        const _ascii_string = "404 not found";
        $(".coded_in_text").text(_ascii_string);

        $(".see_code_in").css("display", "flex");
        $(".coded_in_text").css("display", "flex");

        return false;
    }
    if (asciiObj.type == "image") {
        $(".loading").css("display", "none");


        $(".coded_in_ascii").css("display", "flex");
        const fontsize = $(".coded_in_ascii").width() / parseInt(asciiObj.width);
        $(".coded_in_ascii").css("font-size", fontsize.toString() + "px");
        $(".coded_in_ascii").text(asciiObj.ascii_string);

        $(".see_code_in").css("display", "flex");

    } else if (asciiObj.type == "text" || asciiObj.type == "json") {
        $(".loading").css("display", "none");


        $(".coded_in_text").css("display", "flex");
        $(".coded_in_text").text(asciiObj.ascii_string);
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
