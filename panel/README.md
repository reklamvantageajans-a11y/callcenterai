# Callcenter Kontrollpanel

Çağrı merkezi için canlı kontrol paneli (Next.js). Mevcut sesli asistan projesinden **ayrı** çalışır.

## Özellikler

- **Live Dashboard**: LED tarzı canlı sayaçlar — bugünkü aramalar, aktif görüşme, cevaplanan, kaçan, bekleyen geri aramalar, dönüşüm sayısı/oranı, ortalama süre. Saatlik grafik + gerçek zamanlı aktivite akışı.
- **Anrufe (Aramalar)**: aranan numaralar, kişi, yön, süre, durum, sonuç; isim/numara arama ve sonuç filtresi; kayıt oynatma butonu.
- **Rückrufe (Geri aramalar)**: kim geri aranacak, ne zaman, öncelik ve neden.
- **Aufnahmen (Ses kayıtları)**: kayıt listesi, oynatıcı + dalga formu, indirme.
- **Logs (Günlük loglar)**: seviye filtreli sistem logları.

## Çalıştırma

```bash
cd panel
npm install
npm run dev      # http://localhost:3001
```

Prodüksiyon:

```bash
npm run build && npm start
```

## Mimari

- **Next.js 14 (App Router) + TypeScript + Tailwind CSS**
- Veri şu an `lib/mockData.ts` içindeki örnek verilerden gelir ve `app/api/*` route'ları üzerinden sunulur.
- Gerçek backend'e geçişte sadece `app/api/*` route'larını gerçek veritabanı/servis çağrılarıyla değiştirmek yeterli — arayüz aynı JSON şeklini bekler (`lib/types.ts`).

## Sonraki adım (backend)

Sesli asistan (`../`) ile entegrasyon: her arama bittiğinde çağrı kaydı + ses dosyası + transkript + sonuç bu panelin API'sine yazılır. Kalıcı depolama için Postgres/SQLite (ör. Prisma) önerilir.
