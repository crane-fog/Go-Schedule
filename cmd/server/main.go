// Package main 是服务入口。
//
// 职责（只做装配，不写业务逻辑）：
//  1. 读取配置：config.Load()
//  2. 创建存储实现：storage.NewMemoryStore() 或 storage.NewSQLiteStore(path)
//  3. 组装业务层：schedule.NewService(store)
//  4. 组装 HTTP 层：httpapi.New(service).Routes()
//  5. 启动服务并优雅关闭：http.Server + signal.NotifyContext
//
// 这里是整个项目唯一的"装配点"：谁依赖谁、用哪个实现，都在本文件决定。
//
// TODO: 实现 main()。
package main

import (
	"schedule/internal/config"
	"schedule/internal/handler"
	"schedule/internal/router"
	"schedule/internal/schedule"
	"schedule/internal/storage"
)

func main() {
	// 读取配置
	path := "config.toml"
	cfg, err := config.Load(path)
	if err != nil {
		panic(err)
	}

	// 连接数据库
	store, err := storage.NewSQLiteStore(cfg.DBPath)
	if err != nil {
		panic(err)
	}
	defer store.Close()

	// 组装业务层和 HTTP 层
	s := schedule.NewScheduleService(store)
	h := handler.NewScheduleHandler(s)
	r := router.NewRouter(router.Handlers{ScheduleHandler: h})

	if err := r.Run(cfg.Addr); err != nil{
		panic(err)
	}
}
