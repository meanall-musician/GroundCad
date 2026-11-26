/*! buy-coffee.js — reusable "Postaw mi kawę" widget (G2B). Vanilla JS, no dependencies.
 *  Usage:  <div data-buy-coffee data-app="groundcad"></div>  +  <script src="buy-coffee.js"></script>
 *  or:     BuyCoffee.mount(el, {app:'groundcad', endpoint:'https://pay.g2b.pl/', lang:'pl'})
 *  Options (data-* attributes or object): app, endpoint (payment worker URL), fallbackUrl (e.g. buycoffee.to link),
 *  price (PLN per coffee, default 9.99), presets ("1,5,10,100"), lang (pl|en), askEmail (true|false), returnUrl.
 *  Without endpoint/fallbackUrl the button is disabled ("coming soon"). Colors come from CSS vars
 *  --accent, --text, --text-dim, --line, --panel (with fallbacks) so it fits any host app. */
(function(){
  'use strict';
  var T = {
    pl:{title:'Postaw mi kawę',txt:'Aplikacja jest darmowa i bez reklam. Dobrowolna wpłata pomaga pokryć koszty serwera i domeny oraz dalszy rozwój. Dziękuję!',
      cups:['kawa','kawy','kaw'],total:'Razem',btn:'Postaw kawę',soon:'Płatności wkrótce',email:'Twój e-mail (potrzebny operatorowi płatności)',
      note:'Płatność obsługuje zewnętrzny operator (BLIK, przelew, karta).',busy:'Łączenie z bramką płatności…',err:'Nie udało się rozpocząć płatności. Spróbuj ponownie.',badmail:'Podaj poprawny e-mail.',slider:'Liczba kaw'},
    en:{title:'Buy me a coffee',txt:'This app is free and ad-free. A voluntary tip helps cover server and domain costs and further development. Thank you!',
      cups:['coffee','coffees','coffees'],total:'Total',btn:'Buy a coffee',soon:'Payments coming soon',email:'Your e-mail (required by the payment provider)',
      note:'Payment is handled by an external provider (BLIK, bank transfer, card).',busy:'Connecting to the payment gateway…',err:'Could not start the payment. Please try again.',badmail:'Enter a valid e-mail.',slider:'Number of coffees'}
  };
  var css = '.bc{border:1px solid var(--line,#2c343b);border-radius:10px;padding:12px 14px;margin:0 0 14px;color:var(--text,#e6e9ec);font-size:13px;line-height:1.5}'+
  '.bc *{box-sizing:border-box}.bc-h{font-size:15px;font-weight:700;margin:0 0 4px}.bc-p{color:var(--text-dim,#9aa5ae);margin:0 0 10px}'+
  '.bc-chips{display:flex;gap:6px;flex-wrap:wrap;margin:0 0 8px}'+
  '.bc-chip{width:auto!important;margin:0!important;padding:5px 11px!important;border-radius:999px!important;font-size:12px;cursor:pointer;text-align:center}'+
  '.bc-chip[aria-pressed=true]{border-color:var(--accent,#ff8a3d)!important;color:var(--accent,#ff8a3d)}'+
  '.bc-range{width:100%;accent-color:var(--accent,#ff8a3d);margin:4px 0 6px}'+
  '.bc-sum{display:flex;justify-content:space-between;align-items:baseline;margin:0 0 10px}.bc-amt{font-size:20px;font-weight:700;color:var(--accent,#ff8a3d)}'+
  '.bc-mail{width:100%;margin:0 0 8px;background:var(--panel-2,#1b2126);color:var(--text,#e6e9ec);border:1px solid var(--line,#2c343b);border-radius:4px;padding:7px 8px}.bc-go{width:100%!important;text-align:center;font-weight:700;margin:0!important;cursor:pointer}'+
  '.bc-go[disabled]{opacity:.55;cursor:not-allowed}.bc-note{font-size:11px;color:var(--text-dim,#9aa5ae);margin:8px 0 0}.bc-st{font-size:12px;min-height:16px;margin-top:6px;color:#ff7b7b}';
  function injectCss(){ if(document.getElementById('bc-css')) return; var s=document.createElement('style'); s.id='bc-css'; s.textContent=css; document.head.appendChild(s); }
  function el(tag,cls,txt){ var e=document.createElement(tag); if(cls) e.className=cls; if(txt!=null) e.textContent=txt; return e; }
  function plural(n,f){ return n===1?f[0]:(n%10>=2&&n%10<=4&&(n%100<10||n%100>=20))?f[1]:f[2]; }
  function mount(host,o){
    injectCss(); o=o||{};
    var ds=host.dataset||{};
    var lang=(o.lang||ds.lang||document.documentElement.lang||'pl').slice(0,2); var t=T[lang]||T.pl;
    var price=parseFloat(o.price||ds.price||9.99), app=o.app||ds.app||location.hostname;
    var presets=String(o.presets||ds.presets||'1,5,10,100').split(',').map(Number).filter(function(n){return n>=1&&n<=100;});
    var endpoint=o.endpoint||ds.endpoint||'', fallback=o.fallbackUrl||ds.fallbackUrl||'';
    var askEmail=String(o.askEmail!=null?o.askEmail:(ds.askEmail||'false'))==='true';
    var fmt=function(v){ return v.toFixed(2).replace('.',',')+(lang==='pl'?' zł':' PLN'); };
    var n=presets[0]||1;
    host.textContent=''; var box=el('div','bc'); host.appendChild(box);
    box.appendChild(el('div','bc-h','☕ '+t.title)); box.appendChild(el('p','bc-p',t.txt));
    var chips=el('div','bc-chips'); box.appendChild(chips);
    var range=el('input','bc-range'); range.type='range'; range.min=0; range.max=100; range.step=1; range.setAttribute('aria-label',t.slider); box.appendChild(range);
    var sum=el('div','bc-sum'), lab=el('span'), amt=el('span','bc-amt'); sum.appendChild(lab); sum.appendChild(amt); box.appendChild(sum);
    var mail=null; if(askEmail){ mail=el('input','bc-mail'); mail.type='email'; mail.placeholder=t.email; mail.autocomplete='email'; mail.maxLength=200; box.appendChild(mail); }
    var go=el('button','bc-go'); go.type='button'; box.appendChild(go);
    var st=el('div','bc-st'); st.setAttribute('role','status'); box.appendChild(st);
    box.appendChild(el('div','bc-note',t.note));
    var tToN=function(v){ return Math.max(1,Math.min(100,Math.round(1+99*Math.pow(v/100,2)))); };      // quadratic: fine steps at the low end
    var nToT=function(c){ return Math.round(100*Math.sqrt((c-1)/99)); };
    var btns=presets.map(function(c){ var b=el('button','bc-chip',c+' '+plural(c,t.cups)); b.type='button'; b.onclick=function(){ n=c; render(); }; chips.appendChild(b); return {b:b,c:c}; });
    function render(){
      range.value=nToT(n); lab.textContent=n+' '+plural(n,t.cups)+' · '+t.total; amt.textContent=fmt(Math.round(n*price*100)/100);
      btns.forEach(function(x){ x.b.setAttribute('aria-pressed',x.c===n?'true':'false'); });
      var live=!!(endpoint||fallback); go.disabled=!live;
      go.textContent=live?('☕ '+t.btn+' — '+fmt(Math.round(n*price*100)/100)):t.soon;
    }
    range.addEventListener('input',function(){ n=tToN(+range.value); render(); });
    go.addEventListener('click',function(){
      st.textContent='';
      if(!endpoint){ if(fallback) window.open(fallback,'_blank','noopener'); return; }
      var email=mail?mail.value.trim():''; if(mail&&!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)){ st.textContent=t.badmail; return; }
      go.disabled=true; st.style.color=''; st.textContent=t.busy;
      fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({app:app,coffees:n,amount:Math.round(n*price*100),currency:'PLN',email:email,lang:lang,returnUrl:o.returnUrl||location.href.split('#')[0]})})
        .then(function(r){ return r.json(); })
        .then(function(j){ if(j&&j.url&&/^https:\/\//.test(j.url)){ location.href=j.url; } else throw new Error('bad'); })
        .catch(function(){ st.style.color='#ff7b7b'; st.textContent=t.err; go.disabled=false; });
    });
    render(); return box;
  }
  function auto(){ var h=document.querySelectorAll('[data-buy-coffee]'); for(var i=0;i<h.length;i++) if(!h[i].firstChild) mount(h[i]); }
  window.BuyCoffee={mount:mount,auto:auto};
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',auto); else auto();
})();
