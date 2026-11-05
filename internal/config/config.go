package config

import (
	"fmt"
	"os"

	"github.com/pelletier/go-toml/v2"
)

type Config struct {
	Addr   string `toml:"addr"`
	DBPath string `toml:"db_path"`
}

func Load(path string) (*Config, error) {
	var data []byte
	var err error
	data, err = os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("读取配置文件失败: %v", err)
	}

	var cfg Config
	err = toml.Unmarshal(data, &cfg)
	if err != nil {
		return nil, fmt.Errorf("解析 TOML 失败: %v", err)
	}

	return &cfg, nil
}
