const compress_host = "https://compresspy.fly.dev";

// 압축 함수
async function compressText(originalText) {
    try {
        const response = await fetch(`${compress_host}/compress`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ascii: originalText })
        });

        if (!response.ok) {
            throw new Error(`Compression failed: ${response.statusText}`);
        }

        const result = await response.json();
        return result;
    } catch (error) {
        console.error('Error in compressText:', error.message);
        throw error;
    }
}

// 디코드 함수
async function decompressText(compressedText,method) {
    try {
        const response = await fetch(`${compress_host}/decompress`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                original_text: compressedText,
                method: method
            })
        });

        if (!response.ok) {
            throw new Error(`Decompression failed: ${response.statusText}`);
        }

        const result = await response.json();
        return result.result; // Decompressed text
    } catch (error) {
        console.error('Error in decompressText:', error.message);
        throw error;
    }
}