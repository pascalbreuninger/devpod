package compress

import (
	"bytes"
	"compress/gzip"
	"encoding/base64"
	"io"
)

// Compress gzips a string and base64 encodes it
func Compress(s string) (string, error) {
	b, err := compress([]byte(s))
	if err != nil {
		return "", err
	}

	return base64.StdEncoding.EncodeToString(b), nil
}

func CompressBytes(originalData []byte) ([]byte, error) {
	b, err := compress(originalData)
	if err != nil {
		return nil, err
	}

	dst := make([]byte, base64.StdEncoding.EncodedLen(len(b)))
	base64.StdEncoding.Encode(dst, b)

	return dst, nil
}

func compress(data []byte) ([]byte, error) {
	if data == nil {
		return nil, nil
	}

	var b bytes.Buffer
	gz := gzip.NewWriter(&b)

	_, err := gz.Write(data)
	if err != nil {
		return nil, err
	}

	err = gz.Flush()
	if err != nil {
		return nil, err
	}

	err = gz.Close()
	if err != nil {
		return nil, err
	}

	return b.Bytes(), nil
}

// Decompress decompresses a string
func Decompress(s string) (string, error) {
	if s == "" {
		return "", nil
	}

	decoded, err := base64.StdEncoding.DecodeString(s)
	if err != nil {
		return "", err
	}

	return decompress(decoded)
}

func DecompressBytes(b []byte) (string, error) {
	if b == nil {
		return "", nil
	}

	dstBytes := make([]byte, base64.StdEncoding.DecodedLen(len(b)))
	n, err := base64.StdEncoding.Decode(dstBytes, b)
	if err != nil {
		return "", err
	}
	// make sure to resize properly
	dstBytes = dstBytes[:n]

	return decompress(dstBytes)
}

func decompress(data []byte) (string, error) {
	rdata := bytes.NewReader(data)
	r, err := gzip.NewReader(rdata)
	if err != nil {
		return "", err
	}

	decompressed, err := io.ReadAll(r)
	if err != nil {
		return "", err
	}

	return string(decompressed), nil
}
