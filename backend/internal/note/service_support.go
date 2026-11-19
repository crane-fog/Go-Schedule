package note

import (
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"path/filepath"
	"strings"
	"time"

	"schedule/internal/openapi"
	"schedule/internal/storage"
)

var allowedImageExts = map[string]struct{}{
	".png":  {},
	".jpg":  {},
	".jpeg": {},
	".gif":  {},
	".webp": {},
	".svg":  {},
	".bmp":  {},
	".ico":  {},
	".avif": {},
}

func validateTitle(title string) error {
	if strings.TrimSpace(title) == "" {
		return badRequest("title 不能为空")
	}
	return nil
}

func validateImageExt(filename string) (string, error) {
	ext := strings.ToLower(filepath.Ext(filename))
	if _, ok := allowedImageExts[ext]; !ok {
		return "", badRequest("不支持的图片文件类型")
	}
	return ext, nil
}

func generateImageFilename(ext string) (string, error) {
	buf := make([]byte, 8)
	if _, err := rand.Read(buf); err != nil {
		return "", fmt.Errorf("生成随机文件名失败: %w", err)
	}
	return fmt.Sprintf("%s_%s%s", time.Now().Format("20060102_150405"), hex.EncodeToString(buf), ext), nil
}

func badRequest(message string) error {
	return &openapi.ErrorResponse{Code: 400, Data: openapi.ErrorResponseData{Message: message}}
}

func notFound(message string) error {
	return &openapi.ErrorResponse{Code: 404, Data: openapi.ErrorResponseData{Message: message}}
}

func mapStoreError(err error) error {
	if errors.Is(err, storage.ErrNotFound) {
		return notFound("记事页签不存在")
	}
	return err
}
