# Vuoropäivittäjä

Chrome-laajennus, joka tarkkailee varattavia lääkärivuoroja automaattisesti. Se klikkaa määritettyä päivityspainiketta satunnaisin väliajoin, ja ilmoittaa äänellä tai työpöytäilmoituksella, jos sivun sisältö muuttuu.

## Asennus

1. Avaa `chrome://extensions`
2. Ota käyttöön **Kehittäjätila**
3. Klikkaa **Lataa pakkaamaton**
4. Valitse tämä kansio

## Käyttö

1. Avaa seurattava sivu Chromessa
2. Klikkaa laajennuksen kuvaketta
3. Aseta nykyinen sivu painikkeella **Aseta nykyinen sivu**
4. Valitse päivityspainike painikkeella **Valitse sivulta** tai kirjoita valitsin käsin
5. Tallenna asetukset ja kytke **Tarkkailu päällä**

## Testit

```bash
pnpm test
```
