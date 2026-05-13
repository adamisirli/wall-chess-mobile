# Wall Chess Mobile

Wall Chess Mobile, Expo ve React Native ile geliştirilmiş Quoridor/Wall Chess tarzı mobil strateji oyunudur. Oyuncular tahtada hedef çizgiye ulaşmaya çalışırken duvar yerleştirerek rakibin yolunu zorlaştırır.

## Kullanılan Teknolojiler

- Expo
- React Native
- TypeScript
- Firebase
- AsyncStorage

## Temel Özellikler

- Tek cihazda oyun akışı
- Zorluk seçimi ve yapay zeka modu
- Online oda oluşturma ve odaya katılma altyapısı
- Duvar yerleştirme modu
- Geçerli hamle ve geçerli duvar kontrolü
- Tema, ses ve görsel ayarlar
- Mobil cihazlara uygun dokunmatik arayüz

## Dosya Yapısı

- `App.tsx`: Ana oyun ekranları, oyun mantığı ve arayüz.
- `index.ts`: Expo giriş dosyası.
- `src/firebase/`: Firebase bağlantı dosyaları.
- `src/online/`: Online oyun servisleri.
- `assets/`: Uygulama ikonları ve görseller.
- `package.json`: Script ve bağımlılıklar.

## Kurulum

```bash
npm install
```

## Çalıştırma

```bash
npm start
```

Android için:

```bash
npm run android
```

Web için:

```bash
npm run web
```

## Notlar

- Online özellikler için Firebase ayarlarının doğru olması gerekir.
- `oracleJdk-26` klasörü yerel geliştirme ortamı için eklenmiş görünmektedir; uygulamanın Expo tarafı için ana kaynak kod değildir.
- `.expo` klasörü yerel çalışma çıktısıdır ve teslimde zorunlu değildir.
