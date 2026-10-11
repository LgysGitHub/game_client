import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import reportWebVitals from './reportWebVitals';

// 全局静默 requestPointerLock：ESC 冷却期的 Promise rejection / 同步异常
// 必须在任何调用之前 patch 到原型，杜绝 unhandledrejection 触发错误浮层
;(function suppressPointerLockErrors() {
  const proto = Element.prototype as any;
  const raw = proto.requestPointerLock;
  if (typeof raw === 'function' && !proto.__lockPatched) {
    proto.requestPointerLock = function patchedRequestPointerLock(this: Element, ...args: any[]) {
      try {
        const ret = raw.apply(this, args);
        if (ret && typeof (ret as Promise<void>).catch === 'function') {
          (ret as Promise<void>).catch(() => {});
        }
        return ret;
      } catch {
        return undefined;
      }
    };
    proto.__lockPatched = true;
  }
})();

const root = ReactDOM.createRoot(
  document.getElementById('root') as HTMLElement
);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
reportWebVitals();
