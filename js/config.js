/*
 * ============================================================
 *  YOUR MOSQUE — edit this file to make the template yours.
 *  Everything (name, contact, location, prayer settings,
 *  events, donation link) is read from here.
 * ============================================================
 */
window.SITE = {
  // Name shown in the logo, title and footer — one value per language.
  name: {
    en: 'Al-Noor Islamic Center',
    fr: 'Centre Islamique Al-Noor',
    ar: 'المركز الإسلامي النور'
  },
  shortName: { en: 'Al-Noor', fr: 'Al-Noor', ar: 'النور' },

  // Language shown on first visit: 'en' | 'fr' | 'ar'
  defaultLanguage: 'en',

  contact: {
    phone: '+1 (555) 010-2030',
    whatsapp: '',                       // e.g. '15550102030' (digits only) — leave empty to hide
    email: 'contact@your-mosque.org',
    address: {
      en: '123 Example Street, Your City',
      fr: '123 rue Exemple, Votre Ville',
      ar: '123 شارع المثال، مدينتك'
    }
  },

  social: {
    facebook: '#',
    instagram: '#',
    youtube: '#',
    x: ''                               // leave empty to hide an icon
  },

  // Where the mosque is. Used for prayer times, the map and the Qibla.
  location: {
    city: 'Oran, Algeria',
    lat: 35.6971,
    lng: -0.6308,
    elevation: 0,                       // metres, optional
    timezone: 'Africa/Algiers'          // IANA name: https://en.wikipedia.org/wiki/List_of_tz_database_time_zones
  },

  prayer: {
    // 'Auto' picks the usual method for the country. Or force one of:
    // MWL, ISNA, Egypt, Makkah, Karachi, Algeria, Morocco, Tunisia, France, Paris,
    // Turkey, Gulf, Dubai, Kuwait, Qatar, Singapore, Tehran, Jafari
    method: 'Algeria',
    asr: 'standard',                    // 'standard' (Shafi'i, Maliki, Hanbali) or 'hanafi'
    highLatitude: 'AngleBased',         // 'AngleBased' | 'NightMiddle' | 'OneSeventh' | 'None'
    // Fine-tune each time by +/- minutes to match your official timetable
    adjust: { fajr: 0, sunrise: 0, dhuhr: 0, asr: 0, maghrib: 0, isha: 0 },
    // Minutes between the adhan and the iqama, shown in the timetable
    iqama: { fajr: 20, dhuhr: 15, asr: 15, maghrib: 5, isha: 15 },
    jumuah: { khutbah: '13:00', prayer: '13:30' },
    hijriOffset: 0,                     // shift the Hijri date by +/- days to follow local moon sighting
    use24h: true
  },

  // Upcoming events. Past events hide themselves automatically.
  events: [
    {
      date: '2026-11-14T18:30',
      image: 'img/pillar-1.webp',
      title: { en: 'Evening of Quran Recitation', fr: 'Soirée de récitation du Coran', ar: 'أمسية تلاوة القرآن الكريم' },
      place: { en: 'Main prayer hall', fr: 'Salle de prière principale', ar: 'قاعة الصلاة الرئيسية' }
    },
    {
      date: '2026-12-05T10:00',
      image: 'img/news-3.webp',
      title: { en: 'Family Day & Charity Bazaar', fr: 'Journée des familles & bazar solidaire', ar: 'يوم العائلة والسوق الخيري' },
      place: { en: 'Mosque courtyard', fr: 'Cour de la mosquée', ar: 'ساحة المسجد' }
    },
    {
      date: '2027-01-16T14:00',
      image: 'img/about-2.webp',
      title: { en: 'Seerah Lessons for Youth', fr: 'Cours de Sîra pour les jeunes', ar: 'دروس السيرة النبوية للشباب' },
      place: { en: 'Education wing, room 2', fr: 'Aile éducative, salle 2', ar: 'الجناح التعليمي، القاعة 2' }
    }
  ],

  // Weekly programme. days: 0 = Sunday ... 6 = Saturday.
  // time: '10:00', or 'after:fajr' / 'after:maghrib' / 'after:isha' (follows the prayer time)
  programme: [
    {
      days: [6, 0], time: '10:00',
      title: { en: 'Quran school for children', fr: 'École coranique pour enfants', ar: 'المدرسة القرآنية للأطفال' },
      detail: { en: 'Ages 6–14 · reading, tajweed and memorisation', fr: '6–14 ans · lecture, tajwid et mémorisation', ar: 'من 6 إلى 14 سنة · قراءة وتجويد وحفظ' }
    },
    {
      days: [1, 3], time: 'after:maghrib',
      title: { en: 'Tafsir circle', fr: 'Cercle de tafsir', ar: 'حلقة التفسير' },
      detail: { en: 'Understanding the Quran, one surah at a time', fr: 'Comprendre le Coran, sourate après sourate', ar: 'فهم القرآن الكريم سورة بعد سورة' }
    },
    {
      days: [2], time: '17:30',
      title: { en: "Sisters' halaqa", fr: 'Halaqa des sœurs', ar: 'حلقة الأخوات' },
      detail: { en: 'Fiqh of daily life · sisters’ hall', fr: 'Fiqh du quotidien · salle des sœurs', ar: 'فقه الحياة اليومية · مصلى النساء' }
    },
    {
      days: [4], time: 'after:isha',
      title: { en: 'Youth night', fr: 'Soirée des jeunes', ar: 'سهرة الشباب' },
      detail: { en: 'Talks, questions and sport for ages 15–25', fr: 'Discussions, questions et sport, 15–25 ans', ar: 'محاضرات وأسئلة ورياضة من 15 إلى 25 سنة' }
    },
    {
      days: [5], time: 'jumuah',
      title: { en: "Jumu'ah khutbah", fr: 'Khoutba du vendredi', ar: 'خطبة الجمعة' },
      detail: { en: 'Arrive early — the hall fills up quickly', fr: 'Venez tôt, la salle se remplit vite', ar: 'احضر مبكراً، فالقاعة تمتلئ بسرعة' }
    }
  ],

  // Messages that rotate at the bottom of the prayer-hall screen (display.html)
  announcements: [
    { en: 'Please switch your phone to silent before the prayer.', fr: 'Merci de mettre votre téléphone en silencieux avant la prière.', ar: 'يرجى إغلاق الهاتف أو وضعه على الصامت قبل الصلاة.' },
    { en: '“Indeed, prayer has been decreed upon the believers at fixed times.” — An-Nisa 4:103', fr: '« La prière demeure, pour les croyants, une prescription à des temps déterminés. » — An-Nisa 4:103', ar: 'إِنَّ الصَّلَاةَ كَانَتْ عَلَى الْمُؤْمِنِينَ كِتَابًا مَوْقُوتًا' },
    { en: 'Quran school for children: Saturday and Sunday at 10:00.', fr: 'École coranique pour enfants : samedi et dimanche à 10h.', ar: 'المدرسة القرآنية للأطفال: السبت والأحد على الساعة 10:00.' },
    { en: 'Support your mosque — donation box at the entrance.', fr: 'Soutenez votre mosquée — urne à l’entrée.', ar: 'ادعم مسجدك — صندوق التبرعات عند المدخل.' }
  ],

  // Donation button target (PayPal, LaunchGood, bank page...). '#contact' keeps people on the page.
  donationUrl: '#contact',

  // Numbers in the "Support us" block
  stats: { students: 350, classes: 18, volunteers: 60, families: 900 },

  // Contact form: paste a Formspree / FormSubmit endpoint to receive messages by email.
  // Leave empty and the form opens the visitor's email app instead.
  formEndpoint: ''
};
