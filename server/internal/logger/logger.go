// Package logger 提供基于 zap 的结构化日志。
package logger

import (
	"go.uber.org/zap"
	"go.uber.org/zap/zapcore"
)

var Log *zap.Logger

// Init 根据运行模式初始化全局 logger。release 用 JSON,debug 用彩色控制台。
func Init(mode string) error {
	var cfg zap.Config
	if mode == "release" {
		cfg = zap.NewProductionConfig()
	} else {
		cfg = zap.NewDevelopmentConfig()
		cfg.EncoderConfig.EncodeLevel = zapcore.CapitalColorLevelEncoder
	}
	cfg.EncoderConfig.EncodeTime = zapcore.ISO8601TimeEncoder

	l, err := cfg.Build(
		zap.AddCallerSkip(1),
		zap.AddStacktrace(zapcore.ErrorLevel),
	)
	if err != nil {
		return err
	}
	Log = l
	return nil
}

func Sync() { _ = Log.Sync() }

func Info(msg string, fields ...zap.Field)  { Log.Info(msg, fields...) }
func Warn(msg string, fields ...zap.Field)  { Log.Warn(msg, fields...) }
func Error(msg string, fields ...zap.Field) { Log.Error(msg, fields...) }
func Debug(msg string, fields ...zap.Field) { Log.Debug(msg, fields...) }
func Fatal(msg string, fields ...zap.Field) { Log.Fatal(msg, fields...) }

func String(k, v string) zap.Field      { return zap.String(k, v) }
func Int(k string, v int) zap.Field     { return zap.Int(k, v) }
func Int64(k string, v int64) zap.Field { return zap.Int64(k, v) }
func Bool(k string, v bool) zap.Field   { return zap.Bool(k, v) }
func Err(err error) zap.Field           { return zap.Error(err) }
func Any(k string, v any) zap.Field     { return zap.Any(k, v) }
