#!/usr/bin/env node
/**
 * Nuvio RU Каталоги (Фильмы, Сериалы, Мультфильмы, Аниме)
 * Автономный аддон каталогов и метаданных для Nuvio и Stremio, адаптированный для работы в РФ без VPN.
 *
 * Особенности:
 * - Полностью русский интерфейс (каталоги, жанры, описания, веб-конфигуратор /configure)
 * - Поддержка Kinopoisk Unofficial API (kinopoiskapiunofficial.tech — работает в РФ без VPN)
 * - Поддержка Shikimori API (shikimori.one — аниме-каталоги и поиск работают в РФ без ключа и без VPN)
 * - Автоматический маппинг ID в формат IMDb (tt...) и TMDB для совместимости со скраперами Nuvio
 * - Встроенный прокси постеров (/proxy/image), обходящий блокировки image.tmdb.org у провайдеров РФ
 * - Не требует внешних npm-пакетов (работает на стандартном Node.js 18+)
 *
 * Запуск:
 *   node nuvio_ru_catalog_addon.js
 * После запуска откройте в браузере:
 *   http://127.0.0.1:7000/configure
 */

const http = require('http');
const { URL } = require('url');

const PORT = Number(process.env.PORT || 7000);
const DEFAULT_KP_KEY = process.env.KP_API_KEY || '';
const DEFAULT_TMDB_KEY = process.env.TMDB_API_KEY || '';

// Жанры на русском языке для фильтрации в Nuvio
const MOVIE_GENRES = [
  'Боевик', 'Комедия', 'Фантастика', 'Триллер', 'Драма',
  'Детектив', 'Приключения', 'Ужасы', 'Криминал', 'Мелодрама',
  'Фэнтези', 'Военный', 'История', 'Биография', 'Семейный'
];

const ANIME_GENRES = [
  'Экшен', 'Приключения', 'Комедия', 'Драма', 'Фэнтези',
  'Фантастика', 'Романтика', 'Сверхъестественное', 'Триллер',
  'Психологическое', 'Повседневность', 'Сёнэн', 'Сэйнэн', 'Детектив'
];

// Сопоставление русских названий жанров с ID жанров Kinopoisk Unofficial API
const KP_GENRE_IDS = {
  'триллер': 1,
  'драма': 2,
  'криминал': 3,
  'мелодрама': 4,
  'детектив': 5,
  'фантастика': 6,
  'приключения': 7,
  'биография': 8,
  'боевик': 11,
  'фэнтези': 12,
  'комедия': 13,
  'военный': 14,
  'история': 15,
  'ужасы': 17,
  'мультфильм': 18,
  'семейный': 19
};

// Сопоставление жанров Shikimori
const SHIKI_GENRE_IDS = {
  'экшен': 1,
  'приключения': 2,
  'комедия': 4,
  'драма': 8,
  'фэнтези': 10,
  'романтика': 22,
  'фантастика': 24,
  'повседневность': 36,
  'сверхъестественное': 37,
  'психологическое': 40,
  'триллер': 41,
  'сёнэн': 27,
  'сэйнэн': 42,
  'детектив': 7
};

// Встроенный резервный каталог популярных тайтлов с реальными IMDb ID (на случай, если API-ключ Кинопоиска еще не указан)
const FALLBACK_CATALOG = {
  movies: [
    {
      id: 'tt0816692',
      imdb_id: 'tt0816692',
      type: 'movie',
      name: 'Интерстеллар',
      releaseInfo: '2014',
      imdbRating: '8.7',
      genres: ['Фантастика', 'Драма', 'Приключения'],
      poster: 'https://kinopoiskapiunofficial.tech/images/posters/kp/258687.jpg',
      description: 'Когда засуха, пыльные бури и вымирание растений приводят человечество к продовольственному кризису, коллектив исследователей и учёных отправляется сквозь червоточину в путешествие, чтобы превзойти прежние ограничения для космических путешествий человека.'
    },
    {
      id: 'tt8367814',
      imdb_id: 'tt8367814',
      type: 'movie',
      name: 'Джентльмены',
      releaseInfo: '2019',
      imdbRating: '7.8',
      genres: ['Криминал', 'Комедия', 'Боевик'],
      poster: 'https://kinopoiskapiunofficial.tech/images/posters/kp/1143242.jpg',
      description: 'Один ушлый американец ещё со студенческих лет приторговывал наркотиками, а теперь придумал схему нелегального обогащения с использованием поместий обедневшей английской аристократии.'
    },
    {
      id: 'tt15239678',
      imdb_id: 'tt15239678',
      type: 'movie',
      name: 'Дюна: Часть вторая',
      releaseInfo: '2024',
      imdbRating: '8.5',
      genres: ['Фантастика', 'Боевик', 'Драма'],
      poster: 'https://kinopoiskapiunofficial.tech/images/posters/kp/4540126.jpg',
      description: 'Герцог Пол Атрейдес присоединяется к фрименам, чтобы стать Муад’Дибом, одновременно пытаясь остановить наступление войны.'
    },
    {
      id: 'tt15398776',
      imdb_id: 'tt15398776',
      type: 'movie',
      name: 'Оппенгеймер',
      releaseInfo: '2023',
      imdbRating: '8.3',
      genres: ['Биография', 'Драма', 'История'],
      poster: 'https://kinopoiskapiunofficial.tech/images/posters/kp/4664634.jpg',
      description: 'История жизни американского физика-теоретика Роберта Оппенгеймера, который во времена Второй мировой войны руководил Манхэттенским проектом.'
    },
    {
      id: 'tt0111161',
      imdb_id: 'tt0111161',
      type: 'movie',
      name: 'Побег из Шоушенка',
      releaseInfo: '1994',
      imdbRating: '9.3',
      genres: ['Драма'],
      poster: 'https://kinopoiskapiunofficial.tech/images/posters/kp/326.jpg',
      description: 'Бухгалтер Энди Дюфрейн обвинён в убийстве собственной жены и её любовника. Оказавшись в тюрьме под названием Шоушенк, он сталкивается с жестокостью и беззаконием.'
    },
    {
      id: 'tt0120737',
      imdb_id: 'tt0120737',
      type: 'movie',
      name: 'Властелин колец: Братство Кольца',
      releaseInfo: '2001',
      imdbRating: '8.9',
      genres: ['Фэнтези', 'Приключения', 'Драма'],
      poster: 'https://kinopoiskapiunofficial.tech/images/posters/kp/328.jpg',
      description: 'Сказания о Средиземье — это хроника Великой войны за Кольцо, длившейся не одну тысячу лет.'
    }
  ],
  series: [
    {
      id: 'tt0903747',
      imdb_id: 'tt0903747',
      type: 'series',
      name: 'Во все тяжкие',
      releaseInfo: '2008–2013',
      imdbRating: '9.5',
      genres: ['Криминал', 'Драма', 'Триллер'],
      poster: 'https://kinopoiskapiunofficial.tech/images/posters/kp/404900.jpg',
      description: 'Школьный учитель химии Уолтер Уайт узнаёт, что болен раком лёгких. Чтобы обеспечить финансовое будущее своей семьи, он начинает производить метамфетамин.'
    },
    {
      id: 'tt0944947',
      imdb_id: 'tt0944947',
      type: 'series',
      name: 'Игра престолов',
      releaseInfo: '2011–2019',
      imdbRating: '9.2',
      genres: ['Фэнтези', 'Драма', 'Боевик'],
      poster: 'https://kinopoiskapiunofficial.tech/images/posters/kp/464963.jpg',
      description: 'К концу подходит время благоденствия, и лето, длившееся почти десятилетие, угасает. Вокруг средоточия власти Семи королевств, Железного трона, зреет заговор.'
    },
    {
      id: 'tt12637874',
      imdb_id: 'tt12637874',
      type: 'series',
      name: 'Фоллаут',
      releaseInfo: '2024–...',
      imdbRating: '8.4',
      genres: ['Фантастика', 'Боевик', 'Драма'],
      poster: 'https://kinopoiskapiunofficial.tech/images/posters/kp/1392550.jpg',
      description: 'Через 200 лет после ядерного апокалипсиса обитательница уютного убежища вынуждена выйти на поверхность, где её ждёт опасный и безумный мир пустоши.'
    },
    {
      id: 'tt11280740',
      imdb_id: 'tt11280740',
      type: 'series',
      name: 'Разделение',
      releaseInfo: '2022–...',
      imdbRating: '8.7',
      genres: ['Фантастика', 'Триллер', 'Драма'],
      poster: 'https://kinopoiskapiunofficial.tech/images/posters/kp/1343318.jpg',
      description: 'Руководство компании Lumon Industries придумало новый способ контролировать повседневную деятельность своих сотрудников — процедуру «разделения» рабочих и личных воспоминаний.'
    }
  ],
  cartoons: [
    {
      id: 'tt2861424',
      imdb_id: 'tt2861424',
      type: 'series',
      name: 'Рик и Морти',
      releaseInfo: '2013–...',
      imdbRating: '9.1',
      genres: ['Мультфильм', 'Фантастика', 'Комедия'],
      poster: 'https://kinopoiskapiunofficial.tech/images/posters/kp/685246.jpg',
      description: 'В центре сюжета — школьник по имени Морти и его дедушка Рик, гениальный, но эксцентричный учёный, путешествующие по мультивселенной.'
    },
    {
      id: 'tt11126994',
      imdb_id: 'tt11126994',
      type: 'series',
      name: 'Аркейн',
      releaseInfo: '2021–2024',
      imdbRating: '9.0',
      genres: ['Мультфильм', 'Фантастика', 'Боевик'],
      poster: 'https://kinopoiskapiunofficial.tech/images/posters/kp/4445150.jpg',
      description: 'История двух сестёр, Вай и Паудер, оказавшихся по разные стороны баррикад в противостоянии утопического города Пилтовер и подземного Зауна.'
    },
    {
      id: 'tt9362722',
      imdb_id: 'tt9362722',
      type: 'movie',
      name: 'Человек-паук: Паутина вселенных',
      releaseInfo: '2023',
      imdbRating: '8.6',
      genres: ['Мультфильм', 'Фантастика', 'Боевик'],
      poster: 'https://kinopoiskapiunofficial.tech/images/posters/kp/1227967.jpg',
      description: 'Майлз Моралес отправляется в приключение по мультивселенной вместе с Гвен Стейси и новой командой Людей-пауков.'
    },
    {
      id: 'tt0245429',
      imdb_id: 'tt0245429',
      type: 'movie',
      name: 'Унесённые призраками',
      releaseInfo: '2001',
      imdbRating: '8.6',
      genres: ['Мультфильм', 'Фэнтези', 'Приключения'],
      poster: 'https://kinopoiskapiunofficial.tech/images/posters/kp/370.jpg',
      description: 'Тихиро с мамой и папой переезжает в новый дом. Заблудившись по дороге, они оказываются в странном пустынном городе, населённом духами.'
    }
  ],
  anime: [
    {
      id: 'tt2560140',
      imdb_id: 'tt2560140',
      type: 'series',
      name: 'Атака титанов',
      releaseInfo: '2013–2023',
      imdbRating: '9.1',
      genres: ['Экшен', 'Драма', 'Фэнтези'],
      poster: 'https://kinopoiskapiunofficial.tech/images/posters/kp/749374.jpg',
      description: 'Человечество живёт внутри городов, окружённых тремя огромными стенами, защищающими людей от гигантских людоедов — титанов.'
    },
    {
      id: 'tt29315004',
      imdb_id: 'tt29315004',
      type: 'series',
      name: 'Провожающая в последний путь Фрирен',
      releaseInfo: '2023–...',
      imdbRating: '8.9',
      genres: ['Фэнтези', 'Приключения', 'Драма'],
      poster: 'https://kinopoiskapiunofficial.tech/images/posters/kp/5120018.jpg',
      description: 'Одержав победу над Королём демонов, отряд героя Химмеля вернулся домой. Спустя десятилетия бессмертная эльфийка-маг Фрирен отправляется в новое путешествие.'
    },
    {
      id: 'tt12343534',
      imdb_id: 'tt12343534',
      type: 'series',
      name: 'Магическая битва',
      releaseInfo: '2020–...',
      imdbRating: '8.5',
      genres: ['Экшен', 'Фэнтези', 'Сверхъестественное'],
      poster: 'https://kinopoiskapiunofficial.tech/images/posters/kp/1322324.jpg',
      description: 'Старшеклассник Юдзи Итадори проглатывает проклятый палец Двуликого Сукуны и вступает в Токийский столичный магический колледж.'
    }
  ]
};

// Простой in-memory кэш для ускорения ответов и экономии лимитов API
const CACHE = new Map();
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 минут

function getCached(key) {
  const entry = CACHE.get(key);
  if (!entry) return null;
  if (Date.now() - entry.ts > CACHE_TTL_MS) {
    CACHE.delete(key);
    return null;
  }
  return entry.data;
}

function setCached(key, data) {
  if (CACHE.size > 1500) {
    const oldestKey = CACHE.keys().next().value;
    CACHE.delete(oldestKey);
  }
  CACHE.set(key, { ts: Date.now(), data });
}

// Кодирование и декодирование пользовательской конфигурации в URL
function parseConfig(configSegment) {
  const defaults = {
    kpKey: DEFAULT_KP_KEY,
    tmdbKey: DEFAULT_TMDB_KEY,
    proxyPosters: true,
    enableMovies: true,
    enableSeries: true,
    enableCartoons: true,
    enableAnime: true
  };
  if (!configSegment) return defaults;
  try {
    const json = Buffer.from(decodeURIComponent(configSegment), 'base64url').toString('utf8');
    return { ...defaults, ...JSON.parse(json) };
  } catch (e) {
    try {
      const json = Buffer.from(decodeURIComponent(configSegment), 'base64').toString('utf8');
      return { ...defaults, ...JSON.parse(json) };
    } catch (_) {
      return defaults;
    }
  }
}

function wrapPosterUrl(url, baseUrl, proxyEnabled = true) {
  if (!url) return undefined;
  if (!proxyEnabled) return url;
  // Если постер с заблокированного в РФ image.tmdb.org — проксируем через встроенный эндпоинт или wsrv.nl
  if (url.includes('image.tmdb.org')) {
    return `${baseUrl}/proxy/image?url=${encodeURIComponent(url)}`;
  }
  return url;
}

// Формирование manifest.json на русском языке
function buildManifest(config, baseUrl) {
  const catalogs = [];

  if (config.enableMovies !== false) {
    catalogs.push(
      {
        type: 'movie',
        id: 'ru_movies_popular',
        name: 'Популярные фильмы (РФ)',
        extra: [
          { name: 'genre', isRequired: false, options: MOVIE_GENRES },
          { name: 'skip', isRequired: false },
          { name: 'search', isRequired: false }
        ]
      },
      {
        type: 'movie',
        id: 'ru_movies_top250',
        name: 'Топ-250 лучших фильмов',
        extra: [{ name: 'skip', isRequired: false }]
      },
      {
        type: 'movie',
        id: 'ru_movies_digital',
        name: 'Новинки и цифровые релизы',
        extra: [{ name: 'skip', isRequired: false }]
      }
    );
  }

  if (config.enableSeries !== false) {
    catalogs.push(
      {
        type: 'series',
        id: 'ru_series_popular',
        name: 'Популярные сериалы (РФ)',
        extra: [
          { name: 'genre', isRequired: false, options: MOVIE_GENRES },
          { name: 'skip', isRequired: false },
          { name: 'search', isRequired: false }
        ]
      },
      {
        type: 'series',
        id: 'ru_series_top250',
        name: 'Топ-250 сериалов',
        extra: [{ name: 'skip', isRequired: false }]
      }
    );
  }

  if (config.enableCartoons !== false) {
    catalogs.push(
      {
        type: 'movie',
        id: 'ru_cartoons_movies',
        name: 'Мультфильмы (Полнометражные)',
        extra: [
          { name: 'skip', isRequired: false },
          { name: 'search', isRequired: false }
        ]
      },
      {
        type: 'series',
        id: 'ru_cartoons_series',
        name: 'Мультсериалы и анимация',
        extra: [
          { name: 'skip', isRequired: false },
          { name: 'search', isRequired: false }
        ]
      }
    );
  }

  if (config.enableAnime !== false) {
    catalogs.push(
      {
        type: 'series',
        id: 'ru_anime_popular',
        name: 'Аниме: Популярное (Shikimori)',
        extra: [
          { name: 'genre', isRequired: false, options: ANIME_GENRES },
          { name: 'skip', isRequired: false },
          { name: 'search', isRequired: false }
        ]
      },
      {
        type: 'series',
        id: 'ru_anime_ongoing',
        name: 'Аниме: Онгоинги сезона',
        extra: [
          { name: 'genre', isRequired: false, options: ANIME_GENRES },
          { name: 'skip', isRequired: false }
        ]
      },
      {
        type: 'movie',
        id: 'ru_anime_movies',
        name: 'Аниме: Полнометражные фильмы',
        extra: [
          { name: 'genre', isRequired: false, options: ANIME_GENRES },
          { name: 'skip', isRequired: false },
          { name: 'search', isRequired: false }
        ]
      }
    );
  }

  return {
    id: 'org.nuvio.ru.catalogs',
    version: '1.2.0',
    name: 'Nuvio RU: Каталоги (Фильмы, Сериалы, Мультики, Аниме)',
    description: 'Русскоязычный каталог для Nuvio и Stremio, работающий в России без VPN (Кинопоиск + Shikimori + совместимость со скраперами Nuvio через IMDb/TMDB ID).',
    logo: 'https://wsrv.nl/?url=https://raw.githubusercontent.com/Stremio/stremio-art/master/logo.png',
    types: ['movie', 'series'],
    idPrefixes: ['tt', 'kp:', 'shiki:'],
    resources: [
      'catalog',
      {
        name: 'meta',
        types: ['movie', 'series'],
        idPrefixes: ['tt', 'kp:', 'shiki:']
      }
    ],
    catalogs,
    behaviorHints: {
      configurable: true,
      configurationRequired: false
    }
  };
}

// Запрос к Kinopoisk Unofficial API
async function fetchKinopoisk(endpoint, kpKey) {
  if (!kpKey) return null;
  const url = `https://kinopoiskapiunofficial.tech${endpoint}`;
  const cacheKey = `kp:${url}:${kpKey.slice(0, 6)}`;
  const cached = getCached(cacheKey);
  if (cached) return cached;

  const res = await fetch(url, {
    headers: {
      'X-API-KEY': kpKey,
      'Content-Type': 'application/json',
      'User-Agent': 'NuvioRuCatalogAddon/1.2'
    }
  });
  if (!res.ok) {
    throw new Error(`Kinopoisk API HTTP ${res.status}`);
  }
  const data = await res.json();
  setCached(cacheKey, data);
  return data;
}

// Преобразование элемента Кинопоиска в формат Meta Preview для Nuvio/Stremio
function kpItemToMeta(item, defaultType = 'movie', baseUrl = '', proxyPosters = true) {
  const kpId = item.kinopoiskId || item.filmId;
  // Если есть imdbId (например tt1234567), используем его напрямую, чтобы скраперы Nuvio сразу находили потоки!
  const id = item.imdbId && item.imdbId.startsWith('tt') ? item.imdbId : `kp:${kpId}`;
  const name = item.nameRu || item.nameEn || item.nameOriginal || `Фильм #${kpId}`;
  const isSeries = item.type === 'TV_SERIES' || item.type === 'MINI_SERIES' || item.type === 'TV_SHOW' || defaultType === 'series';
  const type = isSeries ? 'series' : 'movie';
  const rating = item.ratingKinopoisk || item.ratingImdb || (item.rating && item.rating !== 'null' ? item.rating : undefined);
  const genres = Array.isArray(item.genres) ? item.genres.map(g => g.genre).filter(Boolean) : [];
  const year = item.year && item.year !== 'null' ? String(item.year) : '';

  return {
    id,
    imdb_id: item.imdbId || undefined,
    type,
    name,
    poster: wrapPosterUrl(item.posterUrlPreview || item.posterUrl, baseUrl, proxyPosters),
    background: wrapPosterUrl(item.coverUrl || item.posterUrl, baseUrl, proxyPosters),
    genres,
    releaseInfo: year,
    imdbRating: rating ? String(rating) : undefined,
    description: item.description || item.shortDescription || (genres.length ? `Жанры: ${genres.join(', ')} ${year ? `(${year})` : ''}` : undefined)
  };
}

// Запрос к Shikimori API (работает в РФ без ключа и без VPN)
async function fetchShikimoriCatalog({ kind, status, genreName, search, page = 1 }) {
  const params = new URLSearchParams();
  params.set('limit', '20');
  params.set('page', String(page));
  params.set('order', 'popularity');
  if (kind) params.set('kind', kind);
  if (status) params.set('status', status);
  if (search) params.set('search', search);
  if (genreName) {
    const gId = SHIKI_GENRE_IDS[genreName.toLowerCase()];
    if (gId) params.set('genre', String(gId));
  }

  const url = `https://shikimori.one/api/animes?${params.toString()}`;
  const cacheKey = `shiki:${url}`;
  const cached = getCached(cacheKey);
  if (cached) return cached;

  const res = await fetch(url, {
    headers: {
      'User-Agent': 'NuvioRuCatalogAddon/1.2 (https://nuvio.tv)'
    }
  });
  if (!res.ok) {
    throw new Error(`Shikimori API HTTP ${res.status}`);
  }
  const data = await res.json();
  setCached(cacheKey, data);
  return data;
}

// Конвертация MyAnimeList / Shikimori ID в IMDb ID и TMDB ID через публичный маппер ARM API (для скраперов Nuvio)
async function resolveMalToExternalIds(malId) {
  const cacheKey = `arm:${malId}`;
  const cached = getCached(cacheKey);
  if (cached !== null) return cached;

  try {
    const res = await fetch(`https://arm.haglund.dev/api/v2/ids?source=myanimelist&id=${encodeURIComponent(malId)}`, {
      headers: { 'User-Agent': 'NuvioRuCatalogAddon/1.2' }
    });
    if (res.ok) {
      const data = await res.json();
      setCached(cacheKey, data || {});
      return data || {};
    }
  } catch (_) {}
  setCached(cacheKey, {});
  return {};
}

function shikiItemToMeta(item, forcedType = 'series') {
  const shikiId = item.id;
  const name = item.russian || item.name || `Аниме #${shikiId}`;
  const type = item.kind === 'movie' || forcedType === 'movie' ? 'movie' : 'series';
  const poster = item.image && item.image.original
    ? `https://shikimori.one${item.image.original}`
    : undefined;
  const year = item.aired_on ? item.aired_on.slice(0, 4) : '';

  return {
    id: `shiki:${shikiId}`,
    type,
    name,
    poster,
    releaseInfo: year,
    imdbRating: item.score && item.score !== '0.0' ? String(item.score) : undefined,
    description: `${name} (${item.name || ''}). Тип: ${item.kind === 'movie' ? 'Полнометражное аниме' : 'Аниме-сериал'}${year ? `, ${year} г.` : ''}. Рейтинг Shikimori: ${item.score || '—'}.`
  };
}

// Обработка запросов /catalog/{type}/{id}/{extra}.json
async function handleCatalog(type, catalogId, extraArgs, config, baseUrl) {
  const skip = Number(extraArgs.skip || 0);
  const page = Math.floor(skip / 20) + 1;
  const search = extraArgs.search ? String(extraArgs.search).trim() : '';
  const genre = extraArgs.genre ? String(extraArgs.genre).trim() : '';

  // 1. Аниме каталоги через Shikimori (работают в РФ всегда, даже без API-ключей)
  if (catalogId.startsWith('ru_anime_')) {
    try {
      const kind = catalogId === 'ru_anime_movies' ? 'movie' : 'tv,ona';
      const status = catalogId === 'ru_anime_ongoing' ? 'ongoing' : undefined;
      const items = await fetchShikimoriCatalog({
        kind,
        status,
        genreName: genre,
        search,
        page
      });
      if (Array.isArray(items) && items.length > 0) {
        // Для первых элементов параллельно пробуем подтянуть IMDb ID, чтобы скраперы Nuvio срабатывали мгновенно
        const metas = await Promise.all(items.map(async (it) => {
          const baseMeta = shikiItemToMeta(it, type);
          const ext = await resolveMalToExternalIds(it.id);
          if (ext && ext.imdb) {
            baseMeta.id = ext.imdb;
            baseMeta.imdb_id = ext.imdb;
          }
          return baseMeta;
        }));
        return { metas };
      }
    } catch (err) {
      // Если нет сети или ошибка — вернем встроенный резервный список аниме
    }
    return { metas: FALLBACK_CATALOG.anime };
  }

  // 2. Фильмы, Сериалы и Мультфильмы через Kinopoisk Unofficial API (если указан ключ)
  if (config.kpKey) {
    try {
      // Поиск по ключевому слову
      if (search) {
        const data = await fetchKinopoisk(
          `/api/v2.1/films/search-by-keyword?keyword=${encodeURIComponent(search)}&page=${page}`,
          config.kpKey
        );
        const films = (data && data.films) || [];
        return {
          metas: films.map(f => kpItemToMeta(f, type, baseUrl, config.proxyPosters))
        };
      }

      // Коллекции Топ-250 и Популярное
      if (catalogId === 'ru_movies_top250') {
        const data = await fetchKinopoisk(`/api/v2.2/films/collections?type=TOP_250_MOVIES&page=${page}`, config.kpKey);
        return { metas: ((data && data.items) || []).map(f => kpItemToMeta(f, 'movie', baseUrl, config.proxyPosters)) };
      }
      if (catalogId === 'ru_series_top250') {
        const data = await fetchKinopoisk(`/api/v2.2/films/collections?type=TOP_250_TV_SHOWS&page=${page}`, config.kpKey);
        return { metas: ((data && data.items) || []).map(f => kpItemToMeta(f, 'series', baseUrl, config.proxyPosters)) };
      }
      if (catalogId === 'ru_movies_digital') {
        const data = await fetchKinopoisk(`/api/v2.2/films/collections?type=TOP_POPULAR_MOVIES&page=${page}`, config.kpKey);
        return { metas: ((data && data.items) || []).map(f => kpItemToMeta(f, 'movie', baseUrl, config.proxyPosters)) };
      }

      // Фильтрация по типу и жанрам (Фильмы / Сериалы / Мультфильмы)
      const params = new URLSearchParams();
      params.set('order', 'NUM_VOTE');
      params.set('page', String(page));

      if (catalogId === 'ru_cartoons_movies') {
        params.set('type', 'FILM');
        params.set('genres', String(KP_GENRE_IDS['мультфильм']));
      } else if (catalogId === 'ru_cartoons_series') {
        params.set('type', 'TV_SERIES');
        params.set('genres', String(KP_GENRE_IDS['мультфильм']));
      } else if (type === 'series') {
        params.set('type', 'TV_SERIES');
      } else {
        params.set('type', 'FILM');
      }

      if (genre && KP_GENRE_IDS[genre.toLowerCase()]) {
        params.set('genres', String(KP_GENRE_IDS[genre.toLowerCase()]));
      }

      const data = await fetchKinopoisk(`/api/v2.2/films?${params.toString()}`, config.kpKey);
      return {
        metas: ((data && data.items) || []).map(f => kpItemToMeta(f, type, baseUrl, config.proxyPosters))
      };
    } catch (err) {
      // Переход к резервному списку при ошибке API
    }
  }

  // 3. Встроенный резервный каталог (чтобы аддон работал сразу после установки в Nuvio даже без ключа)
  let list = FALLBACK_CATALOG.movies;
  if (catalogId.includes('cartoons')) {
    list = FALLBACK_CATALOG.cartoons.filter(i => i.type === type || catalogId === 'ru_cartoons_movies');
  } else if (type === 'series') {
    list = FALLBACK_CATALOG.series;
  }

  if (genre) {
    const gLower = genre.toLowerCase();
    const filtered = list.filter(i => (i.genres || []).some(g => g.toLowerCase() === gLower));
    if (filtered.length > 0) list = filtered;
  }

  if (search) {
    const sLower = search.toLowerCase();
    const all = [
      ...FALLBACK_CATALOG.movies,
      ...FALLBACK_CATALOG.series,
      ...FALLBACK_CATALOG.cartoons,
      ...FALLBACK_CATALOG.anime
    ];
    list = all.filter(i => i.name.toLowerCase().includes(sLower));
  }

  return { metas: list };
}

// Обработка запросов /meta/{type}/{id}.json (карточка фильма/сериала на русском + привязка к IMDb/TMDB ID для скраперов)
async function handleMeta(type, rawId, config, baseUrl) {
  const id = decodeURIComponent(rawId);

  // 1. Карточка из Shikimori (shiki:12345)
  if (id.startsWith('shiki:')) {
    const shikiId = id.replace('shiki:', '');
    try {
      const res = await fetch(`https://shikimori.one/api/animes/${encodeURIComponent(shikiId)}`, {
        headers: { 'User-Agent': 'NuvioRuCatalogAddon/1.2' }
      });
      if (res.ok) {
        const item = await res.json();
        const ext = await resolveMalToExternalIds(shikiId);
        const imdbId = ext.imdb || undefined;
        const tmdbId = ext.themoviedb || undefined;
        const cleanDesc = (item.description || 'Описание на русском языке временно отсутствует.')
          .replace(/\[.*?\]/g, '');
        const genres = Array.isArray(item.genres) ? item.genres.map(g => g.russian || g.name).filter(Boolean) : [];
        return {
          meta: {
            id: imdbId || id,
            imdb_id: imdbId,
            tmdbId: tmdbId ? String(tmdbId) : undefined,
            type,
            name: item.russian || item.name,
            originalName: item.name,
            releaseInfo: item.aired_on ? item.aired_on.slice(0, 4) : '',
            imdbRating: item.score ? String(item.score) : undefined,
            genres,
            poster: item.image && item.image.original ? `https://shikimori.one${item.image.original}` : undefined,
            description: cleanDesc
          }
        };
      }
    } catch (_) {}
  }

  // 2. Карточка из Кинопоиска (kp:12345 или поиск по IMDb tt...)
  if (config.kpKey) {
    try {
      let kpId = id.startsWith('kp:') ? id.replace('kp:', '') : null;
      if (!kpId && id.startsWith('tt')) {
        const searchData = await fetchKinopoisk(`/api/v2.2/films?imdbId=${encodeURIComponent(id)}`, config.kpKey);
        if (searchData && Array.isArray(searchData.items) && searchData.items[0]) {
          kpId = String(searchData.items[0].kinopoiskId);
        }
      }
      if (kpId) {
        const film = await fetchKinopoisk(`/api/v2.2/films/${encodeURIComponent(kpId)}`, config.kpKey);
        if (film) {
          const metaObj = kpItemToMeta(film, type, baseUrl, config.proxyPosters);
          metaObj.id = film.imdbId || id;
          metaObj.imdb_id = film.imdbId || undefined;
          metaObj.runtime = film.filmLength ? `${film.filmLength} мин.` : undefined;
          metaObj.country = Array.isArray(film.countries) ? film.countries.map(c => c.country).join(', ') : undefined;

          // Если это сериал — подгружаем сезоны и серии для скраперов Nuvio
          if (type === 'series' && metaObj.imdb_id) {
            try {
              const seasonsData = await fetchKinopoisk(`/api/v2.2/films/${encodeURIComponent(kpId)}/seasons`, config.kpKey);
              if (seasonsData && Array.isArray(seasonsData.items)) {
                const videos = [];
                for (const season of seasonsData.items) {
                  for (const ep of (season.episodes || [])) {
                    videos.push({
                      id: `${metaObj.imdb_id}:${season.number}:${ep.episodeNumber}`,
                      title: ep.nameRu || ep.nameEn || `Серия ${ep.episodeNumber}`,
                      season: season.number,
                      episode: ep.episodeNumber,
                      released: ep.releaseDate ? new Date(ep.releaseDate).toISOString() : undefined,
                      overview: ep.synopsis || undefined
                    });
                  }
                }
                if (videos.length > 0) {
                  metaObj.videos = videos;
                }
              }
            } catch (_) {}
          }
          return { meta: metaObj };
        }
      }
    } catch (_) {}
  }

  // 3. Проверка во встроенном резервном списке
  const allFallback = [
    ...FALLBACK_CATALOG.movies,
    ...FALLBACK_CATALOG.series,
    ...FALLBACK_CATALOG.cartoons,
    ...FALLBACK_CATALOG.anime
  ];
  const found = allFallback.find(i => i.id === id || i.imdb_id === id);
  if (found) {
    return { meta: found };
  }

  return { meta: null };
}

// Русскоязычная страница настройки (/configure)
function renderConfigureHtml(baseUrl) {
  return `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Nuvio RU — Конфигуратор русских каталогов</title>
  <style>
    :root {
      --bg: #0f172a;
      --card: #1e293b;
      --border: #334155;
      --accent: #38bdf8;
      --accent-hover: #0284c7;
      --text: #f8fafc;
      --muted: #94a3b8;
      --success: #22c55e;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      padding: 32px 16px;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background: var(--bg);
      color: var(--text);
      line-height: 1.5;
    }
    .container {
      max-width: 680px;
      margin: 0 auto;
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: 16px;
      padding: 28px;
      box-shadow: 0 20px 40px rgba(0,0,0,0.4);
    }
    h1 {
      margin: 0 0 8px 0;
      font-size: 24px;
      color: var(--accent);
    }
    p.sub {
      margin: 0 0 24px 0;
      color: var(--muted);
      font-size: 14px;
    }
    .section {
      margin-bottom: 22px;
      padding-bottom: 18px;
      border-bottom: 1px solid var(--border);
    }
    label.field-label {
      display: block;
      font-weight: 600;
      margin-bottom: 6px;
      font-size: 14px;
    }
    input[type="text"] {
      width: 100%;
      padding: 11px 14px;
      border-radius: 8px;
      border: 1px solid var(--border);
      background: #0b1120;
      color: var(--text);
      font-size: 14px;
    }
    .hint {
      font-size: 12px;
      color: var(--muted);
      margin-top: 6px;
    }
    .hint a {
      color: var(--accent);
      text-decoration: none;
    }
    .checkbox-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: 10px;
      margin-top: 10px;
    }
    .check-item {
      display: flex;
      align-items: center;
      gap: 10px;
      background: #0b1120;
      padding: 10px 12px;
      border-radius: 8px;
      border: 1px solid var(--border);
      font-size: 14px;
      cursor: pointer;
    }
    .url-box {
      background: #0b1120;
      border: 1px solid var(--accent);
      border-radius: 10px;
      padding: 12px 14px;
      font-family: monospace;
      font-size: 13px;
      word-break: break-all;
      margin-bottom: 14px;
      color: #e2e8f0;
    }
    .btn-row {
      display: flex;
      flex-wrap: wrap;
      gap: 12px;
    }
    button, a.btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      padding: 11px 18px;
      border-radius: 8px;
      font-weight: 600;
      font-size: 14px;
      border: none;
      cursor: pointer;
      text-decoration: none;
      transition: background 0.15s;
    }
    .btn-primary {
      background: var(--accent);
      color: #0f172a;
    }
    .btn-primary:hover {
      background: var(--accent-hover);
      color: #fff;
    }
    .btn-secondary {
      background: #334155;
      color: var(--text);
    }
    .badge {
      display: inline-block;
      padding: 3px 8px;
      border-radius: 999px;
      font-size: 11px;
      font-weight: 600;
      background: rgba(34, 197, 94, 0.15);
      color: var(--success);
      margin-left: 8px;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>Nuvio RU: Русские каталоги <span class="badge">Работает в РФ без VPN</span></h1>
    <p class="sub">Фильмы, сериалы, мультфильмы и аниме на русском языке с передачей IMDb/TMDB ID для скраперов Nuvio.</p>

    <div class="section">
      <label class="field-label" for="kpKey">API-ключ Kinopoisk Unofficial (для полного каталога фильмов, сериалов и мультфильмов)</label>
      <input type="text" id="kpKey" placeholder="Например: a1b2c3d4-e5f6-7890-abcd-ef1234567890 (необязательно для теста)" />
      <div class="hint">
        Бесплатный ключ (до 500 запросов в сутки, работает в РФ без VPN) можно получить за 1 минуту на
        <a href="https://kinopoiskapiunofficial.tech/" target="_blank" rel="noopener">kinopoiskapiunofficial.tech</a>.
        Каталог аниме (Shikimori) и стартовая подборка работают сразу даже без ключа.
      </div>
    </div>

    <div class="section">
      <label class="field-label">Выберите разделы для главного экрана Nuvio</label>
      <div class="checkbox-grid">
        <label class="check-item"><input type="checkbox" id="enableMovies" checked /> 🎬 Фильмы (Популярное, Топ-250, Новинки)</label>
        <label class="check-item"><input type="checkbox" id="enableSeries" checked /> 📺 Сериалы (Популярное, Топ-250)</label>
        <label class="check-item"><input type="checkbox" id="enableCartoons" checked /> 🧸 Мультфильмы и мультсериалы</label>
        <label class="check-item"><input type="checkbox" id="enableAnime" checked /> ⛩️ Аниме (Shikimori: Популярное и Онгоинги)</label>
        <label class="check-item"><input type="checkbox" id="proxyPosters" checked /> 🖼️ Проксировать постеры (обход блока РФ)</label>
      </div>
    </div>

    <div>
      <label class="field-label">Готовая ссылка на манифест для вставки в Nuvio (Settings → Addons → Add Addon):</label>
      <div class="url-box" id="manifestUrl">${baseUrl}/manifest.json</div>
      <div class="btn-row">
        <button class="btn-primary" id="copyBtn" type="button">Скопировать ссылку для Nuvio</button>
        <a class="btn btn-secondary" id="stremioBtn" href="stremio://${baseUrl.replace(/^https?:\/\//, '')}/manifest.json">Открыть через stremio://</a>
        <a class="btn btn-secondary" id="jsonBtn" href="${baseUrl}/manifest.json" target="_blank">Проверить manifest.json</a>
      </div>
    </div>
  </div>

  <script>
    const baseUrl = ${JSON.stringify(baseUrl)};
    const inputs = ['kpKey', 'enableMovies', 'enableSeries', 'enableCartoons', 'enableAnime', 'proxyPosters'];

    function toBase64Url(str) {
      return btoa(unescape(encodeURIComponent(str)))
        .replace(/\\+/g, '-')
        .replace(/\\//g, '_')
        .replace(/=+$/, '');
    }

    function updateUrl() {
      const cfg = {
        kpKey: document.getElementById('kpKey').value.trim(),
        enableMovies: document.getElementById('enableMovies').checked,
        enableSeries: document.getElementById('enableSeries').checked,
        enableCartoons: document.getElementById('enableCartoons').checked,
        enableAnime: document.getElementById('enableAnime').checked,
        proxyPosters: document.getElementById('proxyPosters').checked
      };

      const isDefault = !cfg.kpKey && cfg.enableMovies && cfg.enableSeries && cfg.enableCartoons && cfg.enableAnime && cfg.proxyPosters;
      const url = isDefault
        ? baseUrl + '/manifest.json'
        : baseUrl + '/' + toBase64Url(JSON.stringify(cfg)) + '/manifest.json';

      document.getElementById('manifestUrl').textContent = url;
      document.getElementById('stremioBtn').href = url.replace(/^https?:\\/\\//, 'stremio://');
      document.getElementById('jsonBtn').href = url;
    }

    inputs.forEach(id => {
      document.getElementById(id).addEventListener('input', updateUrl);
      document.getElementById(id).addEventListener('change', updateUrl);
    });

    document.getElementById('copyBtn').addEventListener('click', async () => {
      const text = document.getElementById('manifestUrl').textContent;
      try {
        await navigator.clipboard.writeText(text);
        const btn = document.getElementById('copyBtn');
        btn.textContent = 'Скопировано!';
        setTimeout(() => { btn.textContent = 'Скопировать ссылку для Nuvio'; }, 2000);
      } catch (_) {}
    });
  </script>
</body>
</html>`;
}

// Разбор extraArgs вида "genre=Комедия&skip=20"
function parseExtraArgs(extraSegment) {
  if (!extraSegment) return {};
  const clean = extraSegment.replace(/\.json$/i, '');
  const params = new URLSearchParams(clean);
  const out = {};
  for (const [k, v] of params.entries()) {
    out[k] = v;
  }
  return out;
}

// HTTP-сервер с полной поддержкой CORS для Nuvio и Stremio
const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const host = req.headers['x-forwarded-host'] || req.headers.host || `127.0.0.1:${PORT}`;
  const proto = req.headers['x-forwarded-proto'] || 'http';
  const baseUrl = `${proto}://${host}`;
  const parsedUrl = new URL(req.url, baseUrl);
  const pathname = parsedUrl.pathname;

  try {
    // 1. Встроенный прокси изображений (/proxy/image?url=...)
    if (pathname === '/proxy/image') {
      const targetUrl = parsedUrl.searchParams.get('url');
      if (!targetUrl) {
        res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Missing url parameter');
        return;
      }
      // Перенаправляем на незаблокированный в РФ кеширующий CDN wsrv.nl
      res.writeHead(302, { Location: `https://wsrv.nl/?url=${encodeURIComponent(targetUrl)}` });
      res.end();
      return;
    }

    // 2. Страница настройки (/ и /configure)
    if (pathname === '/' || pathname === '/configure' || pathname.endsWith('/configure')) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(renderConfigureHtml(baseUrl));
      return;
    }

    // Определяем, передан ли закодированный конфиг в первом сегменте URL: /{config}/manifest.json
    const segments = pathname.split('/').filter(Boolean);
    let config = parseConfig(null);
    let routeSegments = segments;

    if (
      segments.length >= 2 &&
      !['catalog', 'meta', 'stream', 'subtitles'].includes(segments[0])
    ) {
      config = parseConfig(segments[0]);
      routeSegments = segments.slice(1);
    }

    // 3. Эндпоинт /manifest.json
    if (routeSegments.length === 1 && routeSegments[0] === 'manifest.json') {
      const manifest = buildManifest(config, baseUrl);
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(manifest, null, 2));
      return;
    }

    // 4. Эндпоинт /catalog/{type}/{id}.json и /catalog/{type}/{id}/{extra}.json
    if (routeSegments[0] === 'catalog' && routeSegments.length >= 3) {
      const type = routeSegments[1];
      const rawCatalogId = routeSegments[2].replace(/\.json$/i, '');
      const extraSegment = routeSegments[3] || '';
      const extraArgs = parseExtraArgs(extraSegment);

      const result = await handleCatalog(type, rawCatalogId, extraArgs, config, baseUrl);
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(result));
      return;
    }

    // 5. Эндпоинт /meta/{type}/{id}.json
    if (routeSegments[0] === 'meta' && routeSegments.length >= 3) {
      const type = routeSegments[1];
      const rawId = routeSegments[2].replace(/\.json$/i, '');
      const result = await handleMeta(type, rawId, config, baseUrl);
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(result));
      return;
    }

    res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ error: 'Маршрут не найден' }));
  } catch (err) {
    res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ error: String(err.message || err) }));
  }
});

if (require.main === module) {
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`============================================================`);
    console.log(`Nuvio RU: Сервер русских каталогов успешно запущен!`);
    console.log(`Страница настройки: http://127.0.0.1:${PORT}/configure`);
    console.log(`Ссылка на манифест: http://127.0.0.1:${PORT}/manifest.json`);
    console.log(`============================================================`);
  });
}

module.exports = { server, buildManifest, handleCatalog, handleMeta };
