# „Postaw mi kawę” — wspólny komponent G2B

## Elementy
1. **Widget** `site/buy-coffee.js` (vanilla JS, zero zależności). W dowolnej aplikacji:
   ```html
   <div data-buy-coffee data-app="groundcad" data-endpoint="https://pay.g2b.pl/"></div>
   <script src="https://groundcad.g2b.pl/buy-coffee.js"></script>   <!-- lub skopiuj plik lokalnie -->
   ```
   Opcje (atrybuty `data-*` lub `BuyCoffee.mount(el,{...})`): `app`, `endpoint`, `fallbackUrl` (np. link buycoffee.to), `price` (domyślnie 9.99), `presets` (`1,5,10,100`), `lang` (`pl`/`en`), `askEmail` (`true` dla P24), `returnUrl`.
   Bez `endpoint` i `fallbackUrl` przycisk jest wyłączony („Płatności wkrótce”).
2. **Worker** `coffee/worker/` (`pay.g2b.pl`) — jeden dla wszystkich aplikacji. Kwotę liczy po swojej stronie (kawy × 9,99 zł), sprawdza `Origin` i `returnUrl` względem `ALLOWED_ORIGINS`, tworzy płatność u operatora i zwraca `{url}`. Obsługuje `PROVIDER=stripe` (BLIK, P24, karta; e-mail zbiera Stripe) lub `PROVIDER=p24` (Przelewy24 REST v1 + webhook `/notify/p24`). To szablon: przetestuj w sandboxie operatora przed produkcją.
3. CSP aplikacji musi mieć `connect-src https://pay.g2b.pl` (w groundcad dodane w `site/_headers`).

## Uruchomienie (checklista)
- Wybrać operatora i założyć konto (patrz decyzja w rozmowie), dostać klucze (sandbox + produkcja).
- `cd coffee/worker && npx wrangler secret put ...` (klucze), ustawić `PROVIDER`, `ALLOWED_ORIGINS` (wszystkie domeny aplikacji), wdrożyć na `pay.g2b.pl`.
- W aplikacji ustawić `data-endpoint="https://pay.g2b.pl/"` (+ `data-ask-email="true"` dla P24).
