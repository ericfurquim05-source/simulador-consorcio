(function(global){
  'use strict';
  const S = global.Simulador = global.Simulador || {};
  const KEY='simulador-consorcio-settings-v2';
  const defaults={company:'',consultant:'',phone:'',adminRate:24.2,term:220,bidRate:25,reference:'Julho de 2026'};
  function load(){
    try{return {...defaults,...JSON.parse(localStorage.getItem(KEY)||'{}')}}catch{return {...defaults}}
  }
  function save(settings){const clean={...defaults,...settings};localStorage.setItem(KEY,JSON.stringify(clean));return clean}
  function reset(){localStorage.removeItem(KEY);return {...defaults}}
  S.Configuracoes={load,save,reset,defaults};
})(window);
