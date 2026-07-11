/**
 * 登录过期广播：轮询/取数遇到 401 时，统一唤起登录弹窗（而非静默失败或无限空轮）。
 * AuthModalProvider 挂载时注册 handler,非组件代码（轮询循环、api 封装）通过 notifyAuthExpired 触发。
 */
let handler: (() => void) | null = null;

/** 由 AuthModalProvider 注册；传 null 注销（卸载时）。 */
export function setAuthExpiredHandler(fn: (() => void) | null) {
  handler = fn;
}

/** 任一请求收到 401 时调用：唤起统一登录弹窗（已打开则忽略）。未注册时静默（如营销页）。 */
export function notifyAuthExpired() {
  handler?.();
}
