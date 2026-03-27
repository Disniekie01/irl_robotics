import{d as _,g as q}from"./vendor-react-CPtQYnpm.js";import{ca as O}from"./vendor-ui-CIlZgihx.js";var m={exports:{}},d={};/**
 * @license React
 * use-sync-external-store-shim/with-selector.production.js
 *
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */var E;function g(){if(E)return d;E=1;var a=_(),V=O();function W(r,u){return r===u&&(r!==0||1/r===1/u)||r!==r&&u!==u}var j=typeof Object.is=="function"?Object.is:W,w=V.useSyncExternalStore,y=a.useRef,z=a.useEffect,D=a.useMemo,M=a.useDebugValue;return d.useSyncExternalStoreWithSelector=function(r,u,v,s,f){var t=y(null);if(t.current===null){var o={hasValue:!1,value:null};t.current=o}else o=t.current;t=D(function(){function h(e){if(!R){if(R=!0,l=e,e=s(e),f!==void 0&&o.hasValue){var i=o.value;if(f(i,e))return n=i}return n=e}if(i=n,j(l,e))return i;var p=s(e);return f!==void 0&&f(i,p)?(l=e,i):(l=e,n=p)}var R=!1,l,n,b=v===void 0?null:v;return[function(){return h(u())},b===null?void 0:function(){return h(b())}]},[u,v,s,f]);var c=w(r,t[0],t[1]);return z(function(){o.hasValue=!0,o.value=c},[c]),M(c),c},d}var S;function x(){return S||(S=1,m.exports=g()),m.exports}var C=x();const I=q(C);export{I as u};
//# sourceMappingURL=with-selector-CBQTEoSv.js.map
