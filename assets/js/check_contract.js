var clicked = false;
var imported_signature = []
const MAXCOUNT = 10;

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
    $(".loading").css('display', 'flex');
    const txInfo = await getTransactionInfoOnServer(dataTxid);
    const tail_tx = txInfo.tail_tx;
    const offset = txInfo.offset;
    const type_field = txInfo.type_field;


    const encodedChunks = []
    let before_tx = tail_tx;


    if (type_field == "image") {
        while (before_tx != "Genesis") {
            if (before_tx != undefined) {
                const chunk = await getTransactionInfoOnServer(before_tx);
                if (chunk == undefined) {
                    console.log("No chunk found.");
                    return false;
                }
                chunkData = await _getTransactionData(chunk)
                console.log(chunkData);
                encodedChunks.push(chunkData.data);
                before_tx = chunkData.before_tx;
            } else {
                console.error("before data undefined")
                return;
            }
        }
        const width = extractValue(offset, 'width');
        if (width == false) {
            return false;
        }
        const result = await chunkDecode(encodedChunks.reverse());
        const finalresult = await addLines(result, width);
        const asciiObj = {
            ascii_string: finalresult,
            width: width,
            type: type_field,
        };
        $(".loading").css('display', 'none');
        return asciiObj;
    } else if (type_field == "text" || type_field == "json") {
        while (before_tx != "Genesis") {
            if (before_tx != undefined) {
                const chunk = await getTransactionInfoOnServer(before_tx);
                if (chunk == undefined) {
                    console.log("No chunk found.");
                    return false;
                }

                chunkData = await _getTransactionData(chunk);
                console.log(chunkData);
                encodedChunks.push(chunkData.data.code);
                before_tx = chunkData.before_tx;
            } else {
                console.error("before data undefined")
                return;
            }
        }
        const width = 50;
        const textList = encodedChunks.reverse();
        const textData = textList.join();
        finalresult = convertTextToEmoji(textData);

        const asciiObj = {
            ascii_string: finalresult,
            width: width,
            type: type_field
        };
        $(".loading").css('display', 'none');
        return asciiObj;
    } else {
        return false;
    }


}

async function bringType(dataTxid) {
    const txInfo = await getTransactionInfoOnServer(dataTxid);
    if (txInfo == undefined) {
        return false;
    }
    const tail_tx = txInfo.tail_tx;
    const type_field = txInfo.type_field;
    if (type_field == undefined) {
        return false;
    }
    return type_field;
}

async function fetchDataSignatures(address, before = null) {
    const connection = new solanaWeb3.Connection(network);

    let dataSignatures = [];
    let new_before = null;
    try {
        const signatures = await connection.getSignaturesForAddress(address, {
            before: before,
            limit: MAXCOUNT,
        });

        new_before = signatures[signatures.length - 1];
        if (new_before != null && new_before != undefined) {
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

async function getPreviousValues(array, value) {
    const index = array.indexOf(value);
    if (index === -1) return [];

    const end = Math.min(array.length, index + MAXCOUNT + 1);
    return array.slice(index + 1, end);
}

async function bringAfter(db_pda_address, datapoint) {
    const signatures = await getAfterValues(imported_signature, datapoint);

    $('.transactions_div').empty();
    signatures.forEach(txid => {
        const $transactionElement = $('<p>')
            .addClass('transaction_entry')
            .text(txid)
            .on('click', async function () {
                await handleTransactionClick(txid);
            });
        $('.transactions_div').append($transactionElement);
    });
    const lastPValue = $('.transactions_div p:last').text();
    const firstPValue = $('.transactions_div p:first').text();
    const aftervalue = await getAfterValues(imported_signature, lastPValue);

    if (aftervalue[0] == firstPValue) {
        $(".after_list").css("visibility", "hidden");
    } else {
        $(".before_list").on('click', async function () {
            await bringBefore(db_pda_address, firstPValue);
        });
        $(".before_list").css("visibility", "visible");

        $(".after_list").css("cursor", "pointer");
        $(".after_list").off('click').on('click', async function () {
            await bringAfter(db_pda_address, lastPValue);
        });
    }
}

async function bringBefore(db_pda_address, before) {
    let new_before = null;
    $(".before_list").html("<-loading..");
    $(".before_list").onclick = null;
    $(".before_list").css("cursor", "wait");

    const lastPValue = $('.transactions_div p:last').text();
    const lastElement = imported_signature[imported_signature.length - 1];

    if (lastPValue == lastElement && before != null) {
        new_before = await fetchDataSignatures(db_pda_address, before);
    }
    if (new_before ==! null) {
        const before_before = await fetchDataSignatures(db_pda_address, new_before);
        if (before_before != null) {
            $(".before_list").html("<-Before");

            $(".before_list").css("cursor", "pointer");
            $(".before_list").on('click', async function () {
                await bringBefore(db_pda_address, new_before);
            });
            $(".before_list").css("visibility", "visible");
        } else {
            $(".before_list").css("visibility", "hidden");
        }
    }

    const signatures = await getPreviousValues(imported_signature, lastPValue)
    if (signatures.length > 0) {
        $('.transactions_div').empty();

        signatures.forEach(txid => {
            const $transactionElement = $('<p>')
                .addClass('transaction_entry')
                .text(txid)
                .on('click', async function () {
                    await handleTransactionClick(txid);
                });
            $('.transactions_div').append($transactionElement);
        });
        $(".after_list").css("visibility", "visible");
        $(".after_list").css("cursor", "pointer");
        $(".after_list").off('click').on('click', async function () {
            await bringAfter(db_pda_address, $('.transactions_div p:first').text());
        });

    } else {
        $(".before_list").css("visibility", "hidden");
    }

}

async function viewConnect() {
    $(".before_check").css("display", "none");
    $("#main-load").css("display", "flex");

    const provider = await getProvider();
    const resp = await provider.connect();

    try {
        imported_signature = []
        const userkey = await resp.publicKey;
        const useKeyString = userkey.toString()
        const db_pda = await getDBPDA(useKeyString);
        if (db_pda == undefined) {
            alert("You haven't coded in yet.");
            return false;
        }

        const db_pda_address = new solanaWeb3.PublicKey(db_pda.DBPDA);

        const before = await fetchDataSignatures(db_pda_address);

        if (Array.isArray(imported_signature) && imported_signature.length === 0) {
            alert("You haven't coded in yet.");
            return false;
        }
        const latest_trx = imported_signature[0];
        await handleTransactionClick(latest_trx);

        $('.transactions_div').empty();

        imported_signature.forEach(txid => {
            const $transactionElement = $('<p>')
                .addClass('transaction_entry')
                .text(txid)
                .on('click', async function () {
                    await handleTransactionClick(txid);
                });
            $('.transactions_div').append($transactionElement);
        });
        await highlightTransactions(latest_trx);
        $("#main-load").css("display", "none");
        $(".after_check").css("display", "flex");
        $(".connect_check").css("display", "flex");
        $(".x_my_wallet_btn").css("display", "flex");

        const _post_contant = "Coded-In @IQ6900_\n" +
            "\n" +
            "Check out my collection\n" +
            "This record will remain on the solana blockchain forever\n" +
            "\n" +
            "Check: https://iq6900.com?txid=" + useKeyString;

        const twitterIntentUrl = createTwitterIntent(_post_contant);
        $(".x_my_wallet_btn").off("click").on("click", function () {
            window.open(twitterIntentUrl, '_blank');
        });
        const newbefore = await fetchDataSignatures(db_pda_address,before);
        if (newbefore != null) {
            $(".before_list").on('click', async function () {
                await bringBefore(db_pda_address, before);
            });
            $(".before_list").css("visibility", "visible");
        }

    } catch (err) {
        console.error(err);
    }
}

async function searchWallet(walletStr) {
    $(".before_check").css("display", "none");
    $("#main-load").css("display", "flex");

    try {
        imported_signature = []
        const db_pda = await getDBPDA(walletStr);
        if (db_pda == undefined) {
            alert("This wallet hasn't been coded yet.");
            return false;
        }

        const db_pda_address = new solanaWeb3.PublicKey(db_pda.DBPDA);
        const before = await fetchDataSignatures(db_pda_address);
        if (before != null) {
            $(".before_list").on('click', async function () {
                await bringBefore(db_pda_address, before);
            });
            $(".before_list").css("visibility", "visible");
        }
        if (Array.isArray(imported_signature) && imported_signature.length === 0) {
            alert("You haven't coded in yet.");
            return false;
        }
        const latest_trx = imported_signature[0];

        await handleTransactionClick(latest_trx);
        $('.transactions_div').empty();

        imported_signature.forEach(txid => {
            const $transactionElement = $('<p>')
                .addClass('transaction_entry')
                .text(txid)
                .on('click', async function () {
                    await handleTransactionClick(txid);
                });
            $('.transactions_div').append($transactionElement);
        });
        await highlightTransactions(latest_trx);
        $("#main-load").css("display", "none");
        $(".after_check").css("display", "flex");
        $(".connect_check").css("display", "flex");

    } catch (err) {
        console.error(err);
    }
}

function createTwitterIntent(text) {
    const baseUrl = "https://twitter.com/intent/tweet";
    const encodedText = encodeURIComponent(text); // 텍스트를 URL에 사용할 수 있도록 인코딩
    return `${baseUrl}?text=${encodedText}`;
}


async function transactionButton(txid = "") {
    if (clicked == true) {
        return false
    } else {
        if (txid == "") {
            var txid = $('.transaction_input').val();
        }

        if (txid.length > 40 && txid.length < 48) {
            await searchWallet(txid);
            const post_contant =
                "\n" +
                "Check out this collection: https://iq6900.com?txid=" + txid;
            const twitterIntentUrl = await createTwitterIntent(post_contant);
            $(".x_my_wallet_btn").off("click").on("click", function () {
                window.open(twitterIntentUrl, '_blank');
            });
            $(".x_my_wallet_btn").html("Share This Collection");
        } else if (txid != undefined && txid != "" && txid.length > 80) {
            clicked = true;
            $('.before_check').css('display', 'none');
            $("#main-load").css("display", "flex");

            const asciiObj = await bringCode(txid);
            console.log(asciiObj);
            if (asciiObj == false) {
                $(".on_chain_ascii").css("font-size", "1rem");
                $(".on_chain_ascii").text("404 not found.");
                clicked = false;
                return false;
            }

            if (asciiObj.type == "image") {
                const fontsize = $(".asciidiv").width() / parseInt(asciiObj.width);
                $(".on_chain_ascii").css("font-size", fontsize.toString() + "px");
                $(".on_chain_ascii").css("letter-spacing", "0.3em");

            } else if (asciiObj.type == "text" || asciiObj.type == "json") {
                $(".on_chain_ascii").css("letter-spacing", "0");
                $(".on_chain_ascii").css("line-height", "100%");
                $(".on_chain_ascii").css("white-space", "pre-wrap");
                $(".on_chain_ascii").css("font-size", "1rem");
                $(".on_chain_ascii").css("text-align", "left");
            }
            $(".on_chain_ascii").text(asciiObj.ascii_string);


            const post_contant = "Coded-In @IQ6900_\n" +
                "\n" +
                "This record will remain on the solana blockchain forever\n" +
                "\n" +
                "Check: https://iq6900.com?txid=" + txid;

            $('.x_btn').css('display', 'flex');
            $('.sol_scan').css('display', 'flex');
            const twitterIntentUrl = await createTwitterIntent(post_contant);

            $(".x_btn").off("click").on("click", function () {
                window.open(twitterIntentUrl, '_blank');
            });

            const solscanLink = "https://solscan.io/tx/" + txid;
            $(".sol_scan").off("click").on("click", function () {
                window.open(solscanLink, '_blank');
            });


            $("#main-load").css("display", "none");
            $(".transaction_input_check").css("display", "flex");
            $(".after_check").css("display", "flex");
            clicked = false;
        } else {
            alert("Please enter the signature (txId)");
            return false;
        }
    }
}

async function transactionButton_in_result() {
    if (clicked == true) {
        return false
    } else {
        var txid = $('.transaction_input').val();
        if (txid != undefined && txid != "" && txid.length > 80) {
            clicked = true;
            $(".on_chain_ascii").css('display', 'none');
            $(".loading").css("display", "flex");
            $('.x_btn').css('display', 'none');
            $('.sol_scan').css('display', 'none');
            $(".inputdiv").css("display", "none");

            const asciiObj = await bringCode(txid);
            if (asciiObj == false) {
                $(".on_chain_ascii").css("font-size", "1rem");
                $(".on_chain_ascii").text("404 not found.");
                clicked = false;
                return false;
            }
            const fontsize = $(".asciidiv").width() / parseInt(asciiObj.width);
            $(".on_chain_ascii").css("font-size", fontsize.toString() + "px");
            $(".on_chain_ascii").text(asciiObj.ascii_string);

            const post_contant = "Coded-In @IQ6900_\n" +
                "\n" +
                "This record will remain on the solana blockchain forever\n" +
                "\n" +
                "Check: https://iq6900.com?txid=" + txid;

            $('.x_btn').css('display', 'flex');
            $('.sol_scan').css('display', 'flex');
            const twitterIntentUrl = await createTwitterIntent(post_contant);

            $(".x_btn").off("click").on("click", function () {
                window.open(twitterIntentUrl, '_blank');
            });

            const solscanLink = "https://solscan.io/tx/" + txid;
            $(".sol_scan").off("click").on("click", function () {
                window.open(solscanLink, '_blank');
            });

            $(".loading").css("display", "none");
            $(".on_chain_ascii").css('display', 'flex');
            $(".inputdiv").css("display", "flex");
            clicked = false;
        } else {
            alert("Please enter the signature (txId)");
            return false;
        }
    }
}

async function highlightTransactions(searchString) {
    const paragraphs = document.querySelectorAll('.transactions_div p');

    paragraphs.forEach(p => {
        if (p.textContent.includes(searchString)) {
            p.style.color = '#00b31a';
        } else {
            // Otherwise, set the text color to green
            p.style.color = '#00ff22';
        }
    });
}

async function handleTransactionClick(txid) {
    if (clicked == true) return;
    else {
        clicked = true;
        $(".on_chain_ascii").text("");
        $(".text_div").css("display", "none");
        $(".image_div").css("display", "none");
        $('.x_btn').css('display', 'none');
        $('.sol_scan').css('display', 'none');

        const asciiObj = await bringCode(txid);
        if (asciiObj == false) {
            $(".on_chain_ascii").css("font-size", "1rem");

            const _ascii_string = "404 not found";
            $(".on_chain_ascii").text(_ascii_string);
            clicked = false;
            return false;
        }
        if (asciiObj.type == "image") {
            $(".image_div").css("display", "block");
            const fontsize = $(".image_div").width() / parseInt(asciiObj.width);
            $(".on_chain_ascii").css("font-size", fontsize.toString() + "px");
            $(".on_chain_ascii").text(asciiObj.ascii_string);

        } else if (asciiObj.type == "text" || asciiObj.type == "json") {
            $(".text_div").css("display", "block");
            $(".on_chain_text").text(asciiObj.ascii_string);

        }

        await highlightTransactions(txid);
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
        clicked = false;
    }
}