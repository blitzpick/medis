'use strict';

const zlib = require("zlib");
const msgpack = require('msgpack5')();

module.exports = {
    decode,
    encode,
    tryFormatJSON,

    _compress,
    _encodeGZ64,
    _encodeMessagePack,
    _decompress,
    _decodeGZIP,
    _decodeGZ64,
    _decodeMessagePack,
    _tryDecodeMessagePack
};

const base64Pattern = /^(?:[0-9a-zA-Z+/]{4})*(?:(?:[0-9a-zA-Z+/]{2}==)|(?:[0-9a-zA-Z+/]{3}=))?$/

function decode(buffer) {
    const mightBeGZipped = buffer.length > 10 && buffer[0] === 0x1f && buffer[1] === 0x8b;

    if (mightBeGZipped) {
        // It's a buffer that starts with the signature of a GZIP stream.
        // It's either a valid GZIP stream, or just a buffer full of non-text
        return this._decodeGZIP(buffer);
    }

    const str = buffer.toString();
    const mightBeBase64 = base64Pattern.test(str);

    if (mightBeBase64) {
        // It's either a GZ64 buffer, or just plain text that looks like Base64
        return this._decodeGZ64(str);
    }

    // We ignore MessagePack buffers that consist of *only* an integer,
    // since we can't tell them apart from plain text
    const mightBeMessagePack = buffer[0] > 0x7f;
    if (mightBeMessagePack) {
        return this._decodeMessagePack(buffer);
    }

    return Promise.resolve({
        content: buffer.toString(),
        encoding: "plain"
    });
}

function encode(str, encoding) {
    const buffer = new Buffer(str);

    switch (encoding) {
        case "gzip":
            return this._compress(buffer);

        case "gz64":
            return this._encodeGZ64(buffer);

        case "messagepack":
            return this._encodeMessagePack(buffer);

        default:
            return Promise.resolve(buffer);
    }
}

function tryFormatJSON(jsonString, beautify) {
    try {
        const obj = JSON.parse(jsonString);
        if (!obj || typeof obj !== "object") {
            return undefined;
        }

        return beautify
            ? JSON.stringify(obj, null, '\t')
            : JSON.stringify(obj);
    } catch (e) {
        return undefined;
    }
}

function _compress(buffer) {
    const options = {
        level: 9
    };

    return new Promise((resolve, reject) => {
        zlib.gzip(buffer, options, (err, compressedBuffer) => {
            if (err) {
                return reject(err);
            }

            resolve(compressedBuffer);
        });
    });
}

function _encodeGZ64(buffer) {
    return this._compress(buffer)
        .then(compressedBuffer => {
            return new Buffer(compressedBuffer.toString("base64"));
        });
}

function _encodeMessagePack(buffer) {
    const json = buffer.toString();
    try {
        const obj = JSON.parse(json);
        const encoded = msgpack.encode(obj);
        return Promise.resolve(encoded);
    } catch (err) {
        return Promise.reject(new Error("The content must be valid JSON to encode as MessagePack."))
    }
}

function _decompress(buffer) {
    return new Promise((resolve, reject) => {
        zlib.gunzip(buffer, (err, decompressedBuffer) => {
            if (err) {
                resolve(buffer);
            }

            resolve(decompressedBuffer);
        });
    });
}

function _decodeGZIP(buffer) {
    return this._decompress(buffer)
        .then(decompressedBuffer => {
            if (decompressedBuffer === buffer) {
                return {
                    content: buffer.toString(),
                    encoding: "plain"
                };
            }

            return {
                content: decompressedBuffer.toString(),
                encoding: "gzip"
            };
        });
}

function _decodeGZ64(str) {
    const decodedBuffer = new Buffer(str, "base64");
    return this._decompress(decodedBuffer)
        .then(decompressedBuffer => {
            if (decompressedBuffer === decodedBuffer) {
                return {
                    content: str,
                    encoding: "plain"
                };
            }

            return {
                content: decompressedBuffer.toString(),
                encoding: "gz64"
            };
        });
}

function _decodeMessagePack(buffer) {
    const decodedBuffer = this._tryDecodeMessagePack(buffer);

    if (!decodedBuffer) {
        return Promise.resolve({
            content: buffer.toString(),
            encoding: "plain"
        });
    }

    return Promise.resolve({
        content: decodedBuffer.toString(),
        encoding: "messagepack"
    });
}

function _tryDecodeMessagePack(buffer) {
    try {
        const obj = msgpack.decode(buffer);
        const json = JSON.stringify(obj);
        return new Buffer(json);
    } catch (err) {
        return undefined;
    }
}