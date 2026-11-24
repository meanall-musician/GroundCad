# GroundCAD

Jednoplikowa aplikacja (HTML/JS canvas) do obrysowywania działki, dzielenia jej na kategorie i liczenia powierzchni w m².
Hosting: Cloudflare Workers (Static Assets) → https://groundcad.g2b.pl

## Struktura
- `site/index.html` – cała aplikacja
- `site/example.json` – **rysunek przykładowy** (ładuje się na starcie i pod „Wczytaj projekt → Rysunek przykładowy”). Aby go podmienić, wrzuć w to miejsce dowolny plik zapisany z GroundCAD (format `dzialka-cad-project`) i zrób push.
- `site/_headers` – nagłówki bezpieczeństwa / CSP
- `wrangler.jsonc` – konfiguracja workera (custom domain `groundcad.g2b.pl`)

## Wdrożenie
Cloudflare Dashboard → Workers & Pages → Create → Connect to Git → to repozytorium, nazwa `ground-cad`, deploy command `npx wrangler deploy`. Każdy push do `main` wdraża zmiany. Ręcznie: `npx wrangler deploy`.

## Formularz kontaktowy („O programie”)
Wysyła POST JSON do workera `mail` (https://mail.g2b.workers.dev/) z tokenem Cloudflare Turnstile i polem honeypot `hp`.
W workerze `mail` trzeba:
- dodać `https://groundcad.g2b.pl` do `ALLOWED_ORIGIN`,
- dodać hostname `groundcad.g2b.pl` do widgetu Turnstile (klucz `0x4AAAAAAGER2WSTQmztaybD`).

Adres groundcad@g2b.pl nie występuje w HTML wprost – jest składany w przeglądarce po najechaniu/kliknięciu.

## Wersja (build)
Numer wersji to `<span id="appVer">` w `site/index.html` (widoczny pod nazwą w panelu i w „O programie”). Przy każdym wdrożeniu podnosimy o 0.1 (v1.0 → v1.1 → …).
Ikona: `site/favicon.svg` (źródło), `favicon.ico`, `icon-32.png`, `apple-touch-icon.png`, `icon-512.png`.
