/*
 * AlgoLib inline-only module: inline-overrides.js
 * 仅 inline 版本使用。
 *
 * 当前 `.run/algo-lib-inline-check.js` 与 `.run/algo-lib-check.js`
 * 二进制完全一致，没有 inline 独有函数，也没有同名不同实现的函数。
 *
 * 保留这个空覆盖模块，是为了让构建流程拥有稳定的 inline 扩展点：
 * 以后如果 code-server 内嵌版需要覆盖共享模块中的函数，应在本文件中
 * 重新定义同名函数，并在构建顺序中放到共享模块之后。
 */
