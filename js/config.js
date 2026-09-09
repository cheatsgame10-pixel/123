const firebaseConfig = {
  apiKey: "AIzaSyBJwlx1s7H6nJU98YYshx-R3QyfvS4KIy4",
  authDomain: "gta5rp-hub.firebaseapp.com",
  projectId: "gta5rp-hub",
  storageBucket: "gta5rp-hub.firebasestorage.app",
  messagingSenderId: "166803632974",
  appId: "1:166803632974:web:0cc3c0be44135b0636641f",
  measurementId: "G-FZVFHS950N"
};

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();
const storage = firebase.storage();
const FieldValue = firebase.firestore.FieldValue;
const FIREBASE_API_BASE = 'https://us-central1-gta5rp-hub.cloudfunctions.net/api';

const API_URL = 'https://la-puerta-proxy.vercel.app/';
const API_TIMEOUT_MS = 15000;
const AUTO_REFRESH_MIN = 10;
const TERM_DAYS = 30;
const TERM_DAYS_GOV = 45;
const GOV_FORUM_KEY = 'GOV';
const PRESENCE_HEARTBEAT_MS = 30000;
const PRESENCE_ONLINE_WINDOW_MS = 90000;
const PRESENCE_IDLE_MS = 10 * 60 * 1000;
const AVATAR_MAX_BYTES = 3 * 1024 * 1024;
const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp'];
const PAGE_SIZE = 50;
const PLATFORM_YEAR = 2026;

const ROLES = {
  leader: 'Лидер',
  curator_assistant: 'Помощник куратора',
  curator: 'Куратор',
  chief_overseer: 'Главный следящий',
  server_admin: 'Администратор сервера',
  site_admin: 'Администратор сайта'
};

const ASSIGNABLE_SYSTEM_ROLES = ['curator_assistant', 'curator', 'chief_overseer', 'site_admin'];
const STAFF_ROLES = ['curator_assistant', 'curator', 'chief_overseer', 'server_admin'];
const CURATION_ROLES = ['curator_assistant', 'curator', 'chief_overseer'];

const OVERSEER_DIRECTIONS = ['state', 'ghetto', 'mafia'];
const OVERSEER_DIRECTION_LABELS = {
  state: 'State',
  ghetto: 'Ghetto',
  mafia: 'Mafia'
};

const DIRECTION_CATEGORIES = {
  state: ['gov'],
  ghetto: ['street'],
  mafia: ['syndicate']
};

const EXCLUDED_FORUM_KEYS = ['Генеральный прокурор', 'Председатель Верховного суда'];

const LEVELS = {
  2: 'Хелпер 2 уровня',
  3: 'Администратор 3 уровня',
  4: 'Администратор 4 уровня',
  5: 'Старший администратор',
  6: 'Главный администратор'
};

const PERMISSIONS = {
  editLeaderNickname: 'Изменение никнейма лидера',
  manageDuties: 'Обязанности',
  editDutyTasks: 'Редактировать задачи',
  viewAudit: 'Просмотр журнала действий',
  manageArchive: 'Управление архивом',
  viewUsers: 'Просмотр пользователей',
  manageUsers: 'Управление пользователями',
  manageAdmins: 'Управление администраторами'
};

const CURATION_PERMISSIONS = [
  'editLeaderNickname',
  'manageDuties',
  'editDutyTasks',
  'viewUsers'
];

const CATEGORY_NAMES = {
  gov: 'Государственные',
  judicial: 'Судебная власть',
  street: 'Уличные группировки',
  syndicate: 'Преступные синдикаты',
  other: 'Другое'
};

const CATEGORY_ORDER = ['gov', 'judicial', 'street', 'syndicate', 'other'];
const SIDE_GOV = ['gov', 'judicial'];

const ARCHIVE_RESULTS = [
  'Успешно завершил срок',
  'Ушёл по собственному желанию',
  'Не справился с грузом ответственности'
];

const TICKET_TYPES = { bug: 'Баг', idea: 'Предложение' };
const TICKET_STATUSES = ['На рассмотрении', 'Одобрено', 'Отклонено'];
const DUTY_STATUSES = ['Не начато', 'В процессе', 'Выполнено', 'Просрочено', 'Отменено'];

const DUTY_DEFAULTS = {
  gov: [
    'Проверить твинки в игре',
    'Проверить твинки в Discord',
    'Проверить никнеймы в Discord',
    'Проверить никнеймы в игре',
    'Проверить роли в Discord',
    'Проверить статьи',
    'Проверить задачи',
    'Провести кадровый аудит'
  ],
  fib: [
    'Проверить твинки в игре',
    'Проверить твинки в Discord',
    'Проверить роли в Discord',
    'Проверить ники в Discord',
    'Проверить задачи',
    'Проверить никнеймы в игре',
    'Провести кадровый аудит',
    'Проверить казну'
  ],
  ems: [
    'Проверить твинки в игре',
    'Проверить твинки в Discord',
    'Проверить роли в Discord',
    'Проверить ники в Discord',
    'Проверить задачи',
    'Проверить никнеймы в игре',
    'Провести кадровый аудит',
    'Проверить слив склада',
    'Проверить статьи',
    'Проверить корректность медицинских карт',
    'Проверить казну'
  ],
  lspd: [
    'Проверить твинки в игре',
    'Проверить твинки в Discord',
    'Проверить роли в Discord',
    'Проверить ники в Discord',
    'Проверить задачи',
    'Проверить никнеймы в игре',
    'Провести кадровый аудит',
    'Проверить казну',
  ],
  lssd: [
    'Проверить твинки в игре',
    'Проверить твинки в Discord',
    'Проверить роли в Discord',
    'Проверить ники в Discord',
    'Проверить задачи',
    'Проверить никнеймы в игре',
    'Провести кадровый аудит',
    'Проверить казну'
  ],
  ng: [
    'Проверить твинки в игре',
    'Проверить твинки в Discord',
    'Проверить роли в Discord',
    'Проверить ники в Discord',
    'Проверить задачи',
    'Проверить никнеймы в игре',
    'Провести кадровый аудит',
    'Проверить казну'
  ],
  saspa: [
    'Проверить твинки в игре',
    'Проверить твинки в Discord',
    'Проверить роли в Discord',
    'Проверить ники в Discord',
    'Проверить задачи',
    'Проверить никнеймы в игре',
    'Провести кадровый аудит',
    'Проверить казну'
  ],
  wn: [
    'Проверить твинки в игре',
    'Проверить твинки в Discord',
    'Проверить роли в Discord',
    'Проверить ники в Discord',
    'Проверить задачи',
    'Проверить никнеймы в игре',
    'Провести кадровый аудит',
    'Проверить казну'
  ],
  mm: [
    'Проверить твинки в игре',
    'Проверить твинки в Discord',
    'Проверить роли в Discord',
    'Проверить ники в Discord',
    'Проверить задачи',
    'Проверить никнеймы в игре',
    'Провести кадровый аудит',
    'Проверить казну'
  ],
  am: [
    'Проверить твинки в игре',
    'Проверить твинки в Discord',
    'Проверить роли в Discord',
    'Проверить ники в Discord',
    'Проверить задачи',
    'Проверить никнеймы в игре',
    'Провести кадровый аудит',
    'Проверить казну'
  ],
  rm: [
    'Проверить твинки в игре',
    'Проверить твинки в Discord',
    'Проверить роли в Discord',
    'Проверить ники в Discord',
    'Проверить задачи',
    'Проверить никнеймы в игре',
    'Провести кадровый аудит',
    'Проверить казну'
  ],
  yak: [
    'Проверить твинки в игре',
    'Проверить твинки в Discord',
    'Проверить роли в Discord',
    'Проверить ники в Discord',
    'Проверить задачи',
    'Проверить никнеймы в игре',
    'Провести кадровый аудит',
    'Проверить казну'
  ],
  lcn: [
    'Проверить твинки в игре',
    'Проверить твинки в Discord',
    'Проверить роли в Discord',
    'Проверить ники в Discord',
    'Проверить задачи',
    'Проверить никнеймы в игре',
    'Провести кадровый аудит',
    'Проверить казну'
  ],
  'mg-13': [
    'Проверить твинки в игре',
    'Проверить твинки в Discord',
    'Проверить роли в Discord',
    'Проверить ники в Discord',
    'Проверить задачи',
    'Проверить никнеймы в игре',
    'Провести кадровый аудит',
    'Проверить казну'
  ],
  esb: [
    'Проверить твинки в игре',
    'Проверить твинки в Discord',
    'Проверить роли в Discord',
    'Проверить ники в Discord',
    'Проверить задачи',
    'Проверить никнеймы в игре',
    'Провести кадровый аудит',
    'Проверить казну'
  ],
  lsv: [
    'Проверить твинки в игре',
    'Проверить твинки в Discord',
    'Проверить роли в Discord',
    'Проверить ники в Discord',
    'Проверить задачи',
    'Проверить никнеймы в игре',
    'Провести кадровый аудит',
    'Проверить казну'
  ],
  bsg: [
    'Проверить твинки в игре',
    'Проверить твинки в Discord',
    'Проверить роли в Discord',
    'Проверить ники в Discord',
    'Проверить задачи',
    'Проверить никнеймы в игре',
    'Провести кадровый аудит',
    'Проверить казну'
  ],
  fam: [
    'Проверить твинки в игре',
    'Проверить твинки в Discord',
    'Проверить роли в Discord',
    'Проверить ники в Discord',
    'Проверить задачи',
    'Проверить никнеймы в игре',
    'Провести кадровый аудит',
    'Проверить казну'
  ]
};

const DUTY_TASK_POOL = [
  'Проверить твинки в игре',
  'Проверить твинки в Discord',
  'Проверить роли в Discord',
  'Проверить ники в Discord',
  'Проверить никнеймы в игре',
  'Проверить задачи',
  'Провести кадровый аудит',
  'Проверить слив склада',
  'Проверить статьи',
  'Проверить корректность медицинских карт',
  'Проверить казну',
  'Проверить военные билеты',
  'Проверить отчеты с Bizwar',
  'Проверить отчеты с Ghetto',
];

const DEFAULT_DUTY_TASKS = [
  'Проверить твинки в игре',
  'Проверить твинки в Discord',
  'Проверить роли в Discord',
  'Проверить ники в Discord',
  'Проверить задачи',
  'Проверить никнеймы в игре',
  'Провести кадровый аудит',
  'Проверить казну'
];

const THEME_NAMES = ['purple', 'red', 'orange', 'green', 'pink', 'black'];
const THEME_LABELS = {
  purple: 'Фиолетовый',
  red: 'Красный',
  orange: 'Оранжевый',
  green: 'Зелёный',
  pink: 'Розовый',
  black: 'Чёрный'
};

const FACTION_COLOR_CODES = {
  LSPD: 'lspd', EMS: 'ems', GOV: 'gov', FP: 'fp', WN: 'wn', LSSD: 'lssd',
  NG: 'ng', FIB: 'fib', AM: 'am', MM: 'mm', RM: 'rm', LCN: 'lcn', YAK: 'yak',
  ESB: 'esb', 'MG-13': 'mg13', LSV: 'lsv', BSG: 'bsg', FAM: 'fam'
};

const TAB_TITLES = {
  dashboard: 'Главная',
  leaders: 'Список лидеров',
  archive: 'Архив лидеров',
  news: 'Новости',
  duties: 'Обязанности',
  'faction-checks': 'Проверка фракций',
  support: 'Поддержка',
  profile: 'Профиль',
  users: 'Пользователи',
  factions: 'Фракции',
  audit: 'Журнал действий',
  recovery: 'Восстановление'
};

const state = {
  authUser: null,
  user: null,
  forum: null,
  forumTime: null,
  factions: [],
  factionsById: {},
  factionsByForumKey: {},
  tab: null,
  search: '',
  statusFilter: null,
  archiveSearch: '',
  archiveShowDeleted: false,
  usersSearch: '',
  sessionId: null,
  visitId: null
};
