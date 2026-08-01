(function () {
    // Tiny dictionary-based translator for the redesigned pages (landing +
    // tokenomics). English is the source of truth in the markup; picking a
    // language swaps matching text nodes in place, and re-injecting a template
    // restores English, so applySaved() re-runs after every page render.
    //
    // Fonts: Kode Mono / Zen Dots are Latin-only, so each language brings its
    // own pair. Titles (anything whose stack leads with Zen Dots) get the
    // display font PREPENDED; body text gets the text font spliced in just
    // before the generic "monospace", so Latin glyphs keep resolving to
    // Kode Mono and only KO/RU glyphs fall through.
    //   ko: title PearToucan Bold / body PearToucan Light  (local woff2)
    //   ru: title Syntetic Asrocuus (local woff2) / body JetBrains Mono

    var LS_KEY = "iq_lang";

    var FONTS = {
        ko: { title: "'PearToucan Title'", body: "'PearToucan Text'" },
        ru: { title: "'Syntetic Asrocuus'", body: "'JetBrains Mono'", gcss: "JetBrains+Mono:wght@400;500;600;700" }
    };

    var FACE_CSS =
        "@font-face{font-family:'PearToucan Title';src:url('fonts/peartoucan-bold.woff2') format('woff2');font-display:swap}" +
        "@font-face{font-family:'PearToucan Text';src:url('fonts/peartoucan-light.woff2') format('woff2');font-display:swap}" +
        "@font-face{font-family:'Syntetic Asrocuus';src:url('fonts/syntetic-asrocuus.woff2') format('woff2');font-display:swap}";

    // [en, ko, ru] - keys must equal the trimmed text-node content exactly.
    var STRINGS = [
        // ── shared tickers / stats ──
        ["// DEVELOPING SOLANA INTERNET", "// 솔라나 인터넷을 만드는 중", "// СТРОИМ ИНТЕРНЕТ НА SOLANA"],
        ["FULLY ONCHAIN. FULLY IMMUTABLE.", "완전한 온체인. 완전한 불변성.", "ПОЛНОСТЬЮ ОНЧЕЙН. ПОЛНОСТЬЮ НЕИЗМЕНЯЕМО."],
        ["FREEDOM OF EXPRESSION", "표현의 자유", "СВОБОДА СЛОВА"],
        ["TRUSTLESS NETWORKS", "무신뢰 네트워크", "СЕТИ БЕЗ ДОВЕРИЯ"],
        ["DECENTRALIZED VALUE CREATION", "탈중앙화된 가치 창출", "ДЕЦЕНТРАЛИЗОВАННОЕ СОЗДАНИЕ ЦЕННОСТИ"],
        ["IQ POINTS: 6900", "IQ 포인트: 6900", "ОЧКИ IQ: 6900"],
        ["LIVE PROJECTS: 6+", "라이브 프로젝트: 6+", "ЖИВЫХ ПРОЕКТОВ: 6+"],
        ["HOPIUM: ∞%", "호피움: ∞%", "ХОПИУМ: ∞%"],
        ["$IQ FAIR LAUNCHED 2024", "$IQ 2024 페어 런치", "$IQ: ЧЕСТНЫЙ ЗАПУСК 2024"],
        ["NO RUG, ONLY BRAIN", "러그 없음, 오직 두뇌", "НИКАКОГО РАГА, ТОЛЬКО МОЗГ"],
        ["SCROLL ↓", "스크롤 ↓", "ЛИСТАЙ ↓"],

        // ── nav ──
        ["ABOUT", "소개", "О НАС"],
        ["ROADMAP", "로드맵", "РОАДМАП"],
        ["THE STACK", "스택", "СТЕК"],
        ["TOKENOMICS", "토크노믹스", "ТОКЕНОМИКА"],
        ["ART GENERATOR", "아트 생성기", "ГЕНЕРАТОР АРТА"],
        ["RESOURCES", "리소스", "РЕСУРСЫ"],
        ["DOCS", "문서", "ДОКИ"],

        // ── landing hero ──
        // Hero display title: sized against Zen Dots "HIGH IQ" (~5.5em). Keep
        // each replacement line under ~5.7em in its display font or it clips.
        ["HIGH IQ", "높은 IQ", "ВЫСОКИЙ"],
        ["TECH", "기술", "IQ ТЕХ"],
        ["$IQ TOKEN", "$IQ 토큰", "ТОКЕН $IQ"],
        ["▶ LIVE", "▶ 라이브", "▶ ЛАЙВ"],
        ["FAIR LAUNCH", "페어 런치", "ЧЕСТНЫЙ ЗАПУСК"],
        ["CONTRACT ADDRESS", "컨트랙트 주소", "АДРЕС КОНТРАКТА"],
        ["VIEW TOKENOMICS →", "토크노믹스 보기 →", "СМОТРЕТЬ ТОКЕНОМИКУ →"],
        ["VIEW ON DEXSCREENER →", "덱스크리너에서 보기 →", "СМОТРЕТЬ НА DEXSCREENER →"],
        ["DEVELOPING", "솔라나 인터넷", "СТРОИМ"],
        ["SOLANA INTERNET", "개발 중", "ИНТЕРНЕТ НА SOLANA"],
        ["IQ LABS IS A BLOCKCHAIN PROTOCOL ACTIVELY BUILDING THE ONCHAIN, DECENTRALIZED INTERNET. WE BELIEVE IN FREEDOM OF EXPRESSION, TRUSTLESS NETWORKS AND DECENTRALIZED VALUE CREATION.",
         "IQ 랩스는 온체인 탈중앙 인터넷을 만들어가는 블록체인 프로토콜입니다. 우리는 표현의 자유, 무신뢰 네트워크, 탈중앙화된 가치 창출을 믿습니다.",
         "IQ LABS: блокчейн-протокол, который строит ончейн, децентрализованный интернет. Мы верим в свободу слова, сети без доверия и децентрализованное создание ценности."],
        ["♥ ENTER BLOCKCHAN ♥", "♥ 블록챈 입장 ♥", "♥ ВОЙТИ В BLOCKCHAN ♥"],
        ["BUILD WITH SDK", "SDK로 빌드하기", "СТРОЙ НА SDK"],
        ["BROADCAST", "브로드캐스트", "ЭФИР"],

        // ── landing about ──
        ["IQ LABS IS A BLOCKCHAIN PROTOCOL FOR HIGH IQ BUILDERS IN AI AND BLOCKCHAIN. BUILD WITH OUR TOOLS AND SHIP ONCHAIN.",
         "IQ 랩스는 AI와 블록체인 분야의 높은 IQ 빌더를 위한 블록체인 프로토콜입니다. 우리의 도구로 만들고, 온체인으로 배포하세요.",
         "IQ LABS: блокчейн-протокол для билдеров с высоким IQ в AI и блокчейне. Строй с нашими инструментами и деплой ончейн."],
        ["01 · AI AGENTS", "01 · AI 에이전트", "01 · AI-АГЕНТЫ"],
        ["02 · SOLANA INTEGRATION", "02 · 솔라나 통합", "02 · ИНТЕГРАЦИЯ С SOLANA"],
        ["03 · ONCHAIN STORAGE", "03 · 온체인 스토리지", "03 · ОНЧЕЙН-ХРАНИЛИЩЕ"],
        ["04 · OPEN PROTOCOL", "04 · 오픈 프로토콜", "04 · ОТКРЫТЫЙ ПРОТОКОЛ"],
        ["Deploy intelligent agents that run fully onchain, built and shipped with the IQ SDK.",
         "IQ SDK로 만들고 배포하는, 완전히 온체인에서 동작하는 지능형 에이전트.",
         "Разворачивай умных агентов, которые работают полностью ончейн. Собрано и запущено на IQ SDK."],
        ["Native Solana SDK with blazing-fast onchain execution. High IQ code for high IQ chains.",
         "초고속 온체인 실행을 지원하는 네이티브 솔라나 SDK. 높은 IQ의 체인을 위한 높은 IQ의 코드.",
         "Нативный SDK для Solana с молниеносным ончейн-исполнением. Код с высоким IQ для цепей с высоким IQ."],
        ["Inscribe data, code, and media permanently on Solana. Fully immutable, fully verifiable, no IPFS, no centralized servers.",
         "데이터, 코드, 미디어를 솔라나에 영구히 새깁니다. 완전한 불변, 완전한 검증 가능. IPFS도 중앙 서버도 없습니다.",
         "Записывай данные, код и медиа навсегда в Solana. Полностью неизменяемо, полностью проверяемо. Без IPFS, без центральных серверов."],
        ["Build on the IQ SDK and integrate with the wider ecosystem. Open tooling for builders shipping the onchain Internet.",
         "IQ SDK 위에서 만들고 더 넓은 생태계와 연결하세요. 온체인 인터넷을 만드는 빌더를 위한 오픈 툴링.",
         "Строй на IQ SDK и интегрируйся с широкой экосистемой. Открытые инструменты для билдеров ончейн-интернета."],

        // ── landing roadmap ──
        ["THE MASTER PLAN.", "마스터 플랜.", "ГЕНЕРАЛЬНЫЙ ПЛАН."],
        ["THEY SAID IT COULDN'T BE DONE. THEY WERE WRONG. WITNESS THE HIGH IQ TECH ROADMAP UNFOLD IN REAL TIME.",
         "불가능하다고들 했습니다. 틀렸습니다. 높은 IQ 테크 로드맵이 실시간으로 펼쳐지는 것을 지켜보세요.",
         "Говорили, что это невозможно. Ошибались. Смотри, как роадмап HIGH IQ TECH разворачивается в реальном времени."],
        ["◦ DETAILS COMING SOON™", "◦ 자세한 내용 곧 공개™", "◦ ДЕТАЛИ СКОРО™"],
        ["◦ [REDACTED IQ TOO LOW]", "◦ [검열됨: IQ 부족]", "◦ [СКРЫТО: IQ СЛИШКОМ НИЗКИЙ]"],

        // ── landing stack ──
        ["THE STACK.", "스택.", "СТЕК."],
        ["WE ARE ACTIVELY BUILDING OUT THE CORE INFRASTRUCTURE TO EXPLORE THE POSSIBILITIES OF AN ONCHAIN INTERNET AND STITCH TOGETHER A FLOURISHING DECENTRALIZED ECOSYSTEM.",
         "우리는 온체인 인터넷의 가능성을 탐구하고 번영하는 탈중앙 생태계를 엮어내기 위해 핵심 인프라를 활발히 구축하고 있습니다.",
         "Мы активно строим ключевую инфраструктуру, чтобы исследовать возможности ончейн-интернета и сшить процветающую децентрализованную экосистему."],
        ["ONCHAIN COMMUNITY", "온체인 커뮤니티", "ОНЧЕЙН-КОМЬЮНИТИ"],
        ["ONCHAIN DEV TOOL", "온체인 개발 도구", "ОНЧЕЙН-ИНСТРУМЕНТ"],
        ["IN PROGRESS", "개발 중", "В РАЗРАБОТКЕ"],
        ["AGENT NETWORK", "에이전트 네트워크", "СЕТЬ АГЕНТОВ"],
        ["ASCII ART", "아스키 아트", "ASCII-АРТ"],
        ["Easy-access SDK for building onchain apps. Connect, deploy, and ship AI agents on Solana with minimal friction.",
         "온체인 앱을 쉽게 만드는 SDK. 최소한의 마찰로 솔라나에 AI 에이전트를 연결하고, 배포하고, 출시하세요.",
         "SDK для ончейн-приложений без лишних барьеров. Подключай, разворачивай и запускай AI-агентов на Solana с минимальным трением."],
        ["A fully onchain imageboard community. Every post and image lives permanently on Solana as an inscription.",
         "완전한 온체인 이미지보드 커뮤니티. 모든 게시물과 이미지가 인스크립션으로 솔라나에 영구히 남습니다.",
         "Полностью ончейн-имиджборд. Каждый пост и каждая картинка навсегда живут в Solana как инскрипции."],
        ["Onchain GitHub for AI agent configs and code. Store, version, and share agent blueprints immutably onchain.",
         "AI 에이전트 설정과 코드를 위한 온체인 깃허브. 에이전트 블루프린트를 불변으로 저장, 버전 관리, 공유하세요.",
         "Ончейн-GitHub для конфигов и кода AI-агентов. Храни, версионируй и делись чертежами агентов неизменяемо."],
        ["High IQ search integration for the onchain world. A browser, but smarter, and onchain.",
         "온체인 세계를 위한 높은 IQ 검색 통합. 브라우저인데, 더 똑똑하고, 온체인입니다.",
         "Умный поиск для ончейн-мира. Браузер, только умнее и ончейн."],
        ["An onchain network for AI agents. Skills are soulbound NFTs on Solana, reputation lives in your wallet, and the Android app runs the whole agent on your phone with no server.",
         "AI 에이전트를 위한 온체인 네트워크. 스킬은 솔라나의 소울바운드 NFT이고, 평판은 지갑에 남으며, 안드로이드 앱은 서버 없이 폰에서 에이전트 전체를 실행합니다.",
         "Ончейн-сеть для AI-агентов. Скиллы: соулбаунд-NFT в Solana, репутация живёт в кошельке, а Android-приложение запускает всего агента на телефоне без сервера."],
        ["Turn any image into ASCII art. Upload a picture, dial in the character size and spacing, drop the IQ logo on top, and download your own text-art remix.",
         "어떤 이미지든 아스키 아트로 바꿔보세요. 사진을 올리고, 글자 크기와 간격을 조절하고, IQ 로고를 얹어 나만의 텍스트 아트를 다운로드하세요.",
         "Преврати любую картинку в ASCII-арт. Загрузи фото, настрой размер и шаг символов, добавь логотип IQ и скачай свой текст-арт ремикс."],
        ["X POST →", "X 포스트 →", "ПОСТ В X →"],
        ["DOCS →", "문서 →", "ДОКИ →"],
        ["LAUNCH APP →", "앱 실행 →", "ОТКРЫТЬ →"],
        ["READ THE THREAD →", "스레드 읽기 →", "ЧИТАТЬ ТРЕД →"],

        // ── landing token ──
        ["WE FAIR LAUNCHED OUR TOKEN $IQ AT THE END OF 2024. $IQ PLAYS A KEY ROLE IN THE ECOSYSTEM. READ OUR TOKENOMICS TO LEARN MORE.",
         "2024년 말 $IQ 토큰을 페어 런치했습니다. $IQ는 생태계에서 핵심 역할을 합니다. 자세한 내용은 토크노믹스를 읽어보세요.",
         "Мы честно запустили токен $IQ в конце 2024. $IQ играет ключевую роль в экосистеме. Читай токеномику, чтобы узнать больше."],
        ["ONCHAIN TRANSPARENCY", "온체인 투명성", "ОНЧЕЙН-ПРОЗРАЧНОСТЬ"],
        ["ACTIVE PRODUCTS", "활성 프로덕트", "АКТИВНЫХ ПРОДУКТОВ"],
        ["HOPIUM UNITS", "호피움 유닛", "ЕДИНИЦ ХОПИУМА"],
        ["MAX IQ POINTS", "최대 IQ 포인트", "МАКС. ОЧКОВ IQ"],
        [">> ACCESS TO ALL LAUNCHES AND SDK FEATURES", ">> 모든 런치와 SDK 기능 이용", ">> ДОСТУП КО ВСЕМ ЗАПУСКАМ И ФИЧАМ SDK"],
        [">> DISCOUNTED DEVELOPER FEES FOR BUILDERS", ">> 빌더를 위한 개발자 수수료 할인", ">> СКИДКИ НА КОМИССИИ ДЛЯ БИЛДЕРОВ"],
        [">> FULLY ONCHAIN TRANSPARENCY. NO RUG, ONLY BRAIN", ">> 완전한 온체인 투명성. 러그 없음, 오직 두뇌", ">> ПОЛНАЯ ОНЧЕЙН-ПРОЗРАЧНОСТЬ. НИКАКОГО РАГА, ТОЛЬКО МОЗГ"],
        [">> HACKATHON PRIZES AND PROTOCOL SUPPORT", ">> 해커톤 상금과 프로토콜 지원", ">> ПРИЗЫ ХАКАТОНОВ И ПОДДЕРЖКА ПРОТОКОЛА"],

        // ── landing resources ──
        ["DIG DEEPER.", "더 깊이.", "КОПАЙ ГЛУБЖЕ."],
        ["EVERYTHING YOU NEED TO GO FROM CURIOUS TO GALAXY-BRAINED.",
         "호기심에서 갤럭시 브레인까지, 필요한 모든 것.",
         "Всё, что нужно, чтобы пройти путь от любопытного до галактического мозга."],
        ["ORIGINS", "오리진", "ИСТОКИ"],
        ["WHITEPAPER", "백서", "ВАЙТПЕЙПЕР"],
        ["VISION", "비전", "ВИДЕНИЕ"],
        ["The IQ6900 origin story. Where we came from, why we built on Solana, and what the protocol is really about.",
         "IQ6900의 기원. 우리가 어디서 왔고, 왜 솔라나 위에 만들었고, 이 프로토콜이 진짜 무엇에 관한 것인지.",
         "История происхождения IQ6900. Откуда мы, почему строим на Solana и о чём этот протокол на самом деле."],
        ["The technical and strategic blueprint for IQ Labs. Full breakdown of onchain storage, tokenomics architecture, and the roadmap thesis.",
         "IQ 랩스의 기술적, 전략적 청사진. 온체인 스토리지, 토크노믹스 구조, 로드맵 논지의 전체 분석.",
         "Технический и стратегический чертёж IQ Labs. Полный разбор ончейн-хранилища, архитектуры токеномики и тезиса роадмапа."],
        ["Full developer documentation for the IQ Labs SDK, onchain storage APIs, agent configs, and integration guides.",
         "IQ 랩스 SDK, 온체인 스토리지 API, 에이전트 설정, 통합 가이드의 전체 개발자 문서.",
         "Полная документация разработчика: IQ Labs SDK, API ончейн-хранилища, конфиги агентов и гайды по интеграции."],
        ["The original vision post. The thread that started it all. What Solana Internet means and where IQ Labs is taking it.",
         "모든 것의 시작이 된 오리지널 비전 포스트. 솔라나 인터넷이 무엇을 의미하고 IQ 랩스가 어디로 가는지.",
         "Оригинальный пост с видением. Тред, с которого всё началось. Что такое Solana Internet и куда его ведёт IQ Labs."],
        ["READ ORIGINS →", "오리진 읽기 →", "ЧИТАТЬ ИСТОКИ →"],
        ["READ WHITEPAPER →", "백서 읽기 →", "ЧИТАТЬ ВАЙТПЕЙПЕР →"],
        ["OPEN DOCS →", "문서 열기 →", "ОТКРЫТЬ ДОКИ →"],
        ["READ VISION →", "비전 읽기 →", "ЧИТАТЬ ВИДЕНИЕ →"],

        // ── footer (both pages) ──
        ["// HIGH IQ TECH SHIPPING", "// 높은 IQ 테크 출시 중", "// HIGH IQ TECH ШИППИТ"],
        ["BUILD, ONCHAIN.", "온체인으로 만들자.", "СТРОЙ ОНЧЕЙН."],
        ["POWERED BY BIG BRAIN COMMUNITY", "빅 브레인 커뮤니티가 움직입니다", "НА МОЩНОСТЯХ БОЛЬШОГО МОЗГА"],
        ["// POWERED BY BIG BRAIN COMMUNITY", "// 빅 브레인 커뮤니티가 움직입니다", "// НА МОЩНОСТЯХ БОЛЬШОГО МОЗГА"],
        ["PRODUCTS", "프로덕트", "ПРОДУКТЫ"],
        ["COMMUNITY", "커뮤니티", "КОМЬЮНИТИ"],
        ["TELEGRAM", "텔레그램", "ТЕЛЕГРАМ"],
        ["DISCORD", "디스코드", "ДИСКОРД"],

        // ── tokenomics page ──
        ["← HOME", "← 홈", "← ДОМОЙ"],
        ["FEES", "수수료", "КОМИССИИ"],
        ["ALLOCATION", "배분", "РАСПРЕДЕЛЕНИЕ"],
        ["FLYWHEEL", "플라이휠", "МАХОВИК"],
        ["IMPACT", "임팩트", "ЭФФЕКТ"],
        ["LEVERS", "레버", "РЫЧАГИ"],
        ["REAL USAGE.", "진짜 사용량.", "РЕАЛЬНОЕ ИСПОЛЬЗОВАНИЕ."],
        ["REAL VALUE.", "진짜 가치.", "РЕАЛЬНАЯ ЦЕННОСТЬ."],
        ["Every inscription, database write, SolChat message, and onchain data call through the IQ SDK generates SOL fees, automatically routed into buybacks and community rewards. No $IQ required to build. Every builder makes $IQ more scarce.",
         "IQ SDK를 통한 모든 인스크립션, 데이터베이스 쓰기, SolChat 메시지, 온체인 데이터 호출이 SOL 수수료를 만들고, 자동으로 바이백과 커뮤니티 보상으로 흘러갑니다. 빌드에 $IQ는 필요 없습니다. 모든 빌더가 $IQ를 더 희소하게 만듭니다.",
         "Каждая инскрипция, запись в базу, сообщение SolChat и ончейн-вызов данных через IQ SDK генерирует комиссии в SOL, которые автоматически идут на байбеки и награды комьюнити. Для билда $IQ не нужен. Каждый билдер делает $IQ более редким."],
        ["READ WHITEPAPER", "백서 읽기", "ЧИТАТЬ ВАЙТПЕЙПЕР"],
        ["100% OF FEES, SPLIT ONCHAIN AT COLLECTION", "수수료 100%, 수집 즉시 온체인 분배", "100% КОМИССИЙ ДЕЛЯТСЯ ОНЧЕЙН В МОМЕНТ СБОРА"],
        ["BUYBACK", "바이백", "БАЙБЕК"],
        ["TREASURY", "트레저리", "КАЗНА"],
        ["INDEX", "인덱스", "ИНДЕКС"],
        ["001 / FEE SCHEDULE", "001 / 수수료표", "001 / ТАРИФЫ"],
        ["002 / ALLOCATION", "002 / 배분", "002 / РАСПРЕДЕЛЕНИЕ"],
        ["003 / FLYWHEEL", "003 / 플라이휠", "003 / МАХОВИК"],
        ["004 / IMPACT", "004 / 임팩트", "004 / ЭФФЕКТ"],
        ["005 / LEVERS", "005 / 레버", "005 / РЫЧАГИ"],
        ["EOF / HOLD $IQ", "EOF / $IQ 홀드", "EOF / ДЕРЖИ $IQ"],
        ["PAY PER BYTE. PAY IN SOL.", "바이트당 지불. SOL로 지불.", "ПЛАТИ ЗА БАЙТ. ПЛАТИ В SOL."],
        ["Any developer or application on Solana using the IQ SDK pays simple, flat SOL fees per transaction. No $IQ tokens required. Frictionless adoption by default.",
         "솔라나에서 IQ SDK를 쓰는 어떤 개발자나 애플리케이션이든 트랜잭션당 단순한 고정 SOL 수수료를 냅니다. $IQ 토큰은 필요 없습니다. 마찰 없는 도입이 기본값입니다.",
         "Любой разработчик или приложение на Solana, использующие IQ SDK, платят простую фиксированную комиссию в SOL за транзакцию. Токены $IQ не нужны. Внедрение без трения по умолчанию."],
        ["DATA SIZE", "데이터 크기", "РАЗМЕР ДАННЫХ"],
        ["RANGE", "범위", "ДИАПАЗОН"],
        ["FEE", "수수료", "КОМИССИЯ"],
        ["USE CASES", "사용 사례", "СЦЕНАРИИ"],
        ["< 850 bytes", "< 850 바이트", "< 850 байт"],
        ["850 to 8,500 bytes", "850 ~ 8,500 바이트", "от 850 до 8 500 байт"],
        ["> 8,500 bytes", "> 8,500 바이트", "> 8 500 байт"],
        ["SolChat messages, status updates, small JSON payloads, HTTP-style API responses, key-value records",
         "SolChat 메시지, 상태 업데이트, 작은 JSON 페이로드, HTTP 스타일 API 응답, 키-값 레코드",
         "Сообщения SolChat, статусы, небольшие JSON-пейлоады, ответы API в стиле HTTP, key-value записи"],
        ["Database writes, inscriptions, structured data",
         "데이터베이스 쓰기, 인스크립션, 구조화된 데이터",
         "Записи в базу, инскрипции, структурированные данные"],
        ["Rich content, large dataset storage, bulk ops",
         "리치 콘텐츠, 대용량 데이터셋 저장, 대량 작업",
         "Богатый контент, крупные датасеты, массовые операции"],
        ["WHERE EVERY SOL GOES.", "모든 SOL이 가는 곳.", "КУДА ИДЁТ КАЖДЫЙ SOL."],
        ["100% of collected fees are algorithmically split onchain at the time of collection. No discretion. No delay.",
         "수집된 수수료의 100%가 수집 시점에 온체인에서 알고리즘으로 분배됩니다. 재량 없음. 지연 없음.",
         "100% собранных комиссий алгоритмически делятся ончейн в момент сбора. Без усмотрения. Без задержки."],
        ["$IQ Buyback Engine", "$IQ 바이백 엔진", "Движок байбека $IQ"],
        ["Operations Treasury", "운영 트레저리", "Операционная казна"],
        ["Community Rewards Pool", "커뮤니티 보상 풀", "Пул наград комьюнити"],
        ["Liquidity Pool", "유동성 풀", "Пул ликвидности"],
        ["Market purchases of $IQ retained by the Treasury as a strategic reserve. Every fee event removes circulating supply from the market.",
         "트레저리가 전략적 준비금으로 보유하는 $IQ 시장 매수. 모든 수수료 이벤트가 유통 공급량을 시장에서 걷어냅니다.",
         "Рыночные покупки $IQ, которые казна держит как стратегический резерв. Каждое событие комиссии убирает из рынка циркулирующее предложение."],
        ["Salaries, servers, marketing, development, and ecosystem grants. Funds the work that ships the SDK and grows the surface area.",
         "급여, 서버, 마케팅, 개발, 생태계 그랜트. SDK를 출시하고 접점을 키우는 일에 자금을 댑니다.",
         "Зарплаты, серверы, маркетинг, разработка и гранты экосистеме. Финансирует работу, которая шиппит SDK и расширяет поверхность."],
        ["Real yield distributed to the $IQ community in SOL or repurchased $IQ. Sourced entirely from SDK transaction fees, not token inflation or emissions.",
         "SOL 또는 재매입한 $IQ로 $IQ 커뮤니티에 분배되는 진짜 수익. 토큰 인플레이션이나 발행이 아니라 전부 SDK 트랜잭션 수수료에서 나옵니다.",
         "Реальный доход, распределяемый комьюнити $IQ в SOL или выкупленных $IQ. Полностью из комиссий SDK, а не из инфляции или эмиссии токена."],
        ["Continuous deepening of the IQ/SOL pair. Tighter spreads, less slippage, healthier markets at every volume tier.",
         "IQ/SOL 페어의 지속적인 유동성 강화. 더 좁은 스프레드, 더 적은 슬리피지, 모든 볼륨 구간에서 더 건강한 시장.",
         "Постоянное углубление пары IQ/SOL. Уже спреды, меньше проскальзывания, здоровее рынки на любом объёме."],
        ["// straight up: if monthly revenue stays under $10k, most of it keeps the lights on and the devs paid. This is not carved in stone. The tokenomics evolve as the community grows.",
         "// 솔직하게: 월 수익이 $10k 아래면 대부분은 서버 유지와 개발자 월급으로 갑니다. 돌에 새긴 것이 아닙니다. 토크노믹스는 커뮤니티가 자라며 함께 진화합니다.",
         "// честно: пока месячная выручка ниже $10k, большая её часть держит свет включённым и платит девелоперам. Это не высечено в камне. Токеномика эволюционирует вместе с комьюнити."],
        ["BUILDERS. USERS. BUYBACKS.", "빌더. 유저. 바이백.", "БИЛДЕРЫ. ЮЗЕРЫ. БАЙБЕКИ."],
        ["Builders adopt the IQ SDK", "빌더가 IQ SDK를 도입한다", "Билдеры внедряют IQ SDK"],
        ["Users transact onchain", "유저가 온체인에서 거래한다", "Юзеры транзактят ончейн"],
        ["SOL fees collected, split onchain", "SOL 수수료가 걷히고 온체인에서 분배된다", "Комиссии в SOL собираются и делятся ончейн"],
        ["$IQ bought back from the market", "시장에서 $IQ를 바이백한다", "$IQ выкупается с рынка"],
        ["Supply shrinks. Value accrues. Loop.", "공급이 줄어든다. 가치가 쌓인다. 반복.", "Предложение сжимается. Ценность копится. Повтор."],
        ["Passive holders benefit from every transaction without lifting a finger. The more apps build on IQ SDK, the harder $IQ deflates.",
         "패시브 홀더는 손 하나 까딱하지 않고 모든 트랜잭션의 혜택을 받습니다. IQ SDK 위에 앱이 많아질수록 $IQ 디플레이션은 강해집니다.",
         "Пассивные холдеры получают выгоду с каждой транзакции, не шевеля пальцем. Чем больше приложений строится на IQ SDK, тем жёстче дефлирует $IQ."],
        ["10,000 DAILY TRANSACTIONS.", "일일 10,000 트랜잭션.", "10 000 ТРАНЗАКЦИЙ В ДЕНЬ."],
        ["Scenario: 10,000 daily transactions at 0.003 SOL average. Numbers below are illustrative. The flywheel scales with adoption.",
         "시나리오: 평균 0.003 SOL로 일일 10,000 트랜잭션. 아래 숫자는 예시입니다. 플라이휠은 도입과 함께 확장됩니다.",
         "Сценарий: 10 000 транзакций в день при средней 0.003 SOL. Цифры ниже иллюстративны. Маховик масштабируется с внедрением."],
        ["DAILY FEES COLLECTED", "일일 수집 수수료", "КОМИССИЙ СОБРАНО ЗА ДЕНЬ"],
        ["ROUTED TO BUYBACKS (40%)", "바이백으로 라우팅 (40%)", "НАПРАВЛЕНО НА БАЙБЕКИ (40%)"],
        ["BOUGHT BACK DAILY AT $0.01", "$0.01 기준 일일 바이백", "ВЫКУПАЕТСЯ В ДЕНЬ ПРИ $0.01"],
        ["// Illustrative only. Buyback volume scales with adoption and SOL price. As $IQ price rises, fewer tokens are repurchased per cycle. Supply absorption is real regardless.",
         "// 예시일 뿐입니다. 바이백 볼륨은 도입과 SOL 가격에 따라 변합니다. $IQ 가격이 오르면 사이클당 재매입 토큰 수는 줄어듭니다. 공급 흡수는 어느 쪽이든 실재합니다.",
         "// Только иллюстрация. Объём байбеков растёт с внедрением и ценой SOL. Когда цена $IQ растёт, за цикл выкупается меньше токенов. Поглощение предложения реально в любом случае."],
        ["SHAPED. NOT DECIDED.", "함께 만듭니다. 확정이 아니라.", "ФОРМИРУЕТСЯ. НЕ РЕШЕНО."],
        ["As the protocol matures, the community helps shape which additional flywheel accelerants get activated.",
         "프로토콜이 성숙해질수록, 어떤 플라이휠 가속 장치를 켤지 커뮤니티가 함께 정합니다.",
         "По мере зрелости протокола комьюнити помогает решать, какие ускорители маховика включать."],
        ["SDK Builder Grants", "SDK 빌더 그랜트", "Гранты билдерам SDK"],
        ["Revenue Share Expansion", "수익 공유 확대", "Расширение доли дохода"],
        ["Fee Tier Optimization", "수수료 구간 최적화", "Оптимизация тарифов"],
        ["Cross-Chain SDK Expansion", "크로스체인 SDK 확장", "Кроссчейн-экспансия SDK"],
        ["Treasury-funded grants to developers building high-volume applications on the IQ SDK, directly accelerating fee generation.",
         "고볼륨 애플리케이션을 만드는 개발자에게 트레저리가 지원하는 그랜트. 수수료 생성을 직접 가속합니다.",
         "Гранты из казны разработчикам высоконагруженных приложений на IQ SDK. Прямое ускорение генерации комиссий."],
        ["Community-driven decision to expand reward allocation as treasury reserves grow.",
         "트레저리 준비금이 커질수록 보상 배분을 확대하는 커뮤니티 주도 결정.",
         "Решение комьюнити расширять распределение наград по мере роста резервов казны."],
        ["Community-driven adjustments to fee thresholds to maximize adoption or revenue at different growth stages.",
         "성장 단계별로 도입 또는 수익을 극대화하도록 수수료 기준을 조정하는 커뮤니티 주도 조정.",
         "Корректировка порогов комиссий силами комьюнити, чтобы максимизировать внедрение или выручку на разных этапах роста."],
        ["Treasury-funded development extending the SDK beyond Solana, multiplying the fee-generating surface area.",
         "SDK를 솔라나 너머로 확장하는 트레저리 지원 개발. 수수료를 만드는 접점을 배로 늘립니다.",
         "Финансируемое казной развитие SDK за пределы Solana. Умножает поверхность, генерирующую комиссии."],
        ["EVERY CALL. EVERY WRITE.", "모든 호출. 모든 쓰기.", "КАЖДЫЙ ВЫЗОВ. КАЖДАЯ ЗАПИСЬ."],
        ["EVERY MESSAGE.", "모든 메시지.", "КАЖДОЕ СООБЩЕНИЕ."],
        ["The IQ SDK is live. Developers are building. Every transaction flows through a fee mechanism designed to make $IQ mathematically scarcer over time. No manual intervention. No team discretion. Just code: usage, fees, buybacks, fewer tokens chasing the same demand.",
         "IQ SDK는 라이브입니다. 개발자들이 만들고 있습니다. 모든 트랜잭션이 $IQ를 시간이 갈수록 수학적으로 더 희소하게 만드는 수수료 메커니즘을 통과합니다. 수동 개입 없음. 팀 재량 없음. 오직 코드: 사용량, 수수료, 바이백, 같은 수요를 쫓는 더 적은 토큰.",
         "IQ SDK уже в проде. Разработчики строят. Каждая транзакция проходит через механизм комиссий, спроектированный так, чтобы $IQ математически становился всё более редким. Без ручного вмешательства. Без усмотрения команды. Только код: использование, комиссии, байбеки, меньше токенов на тот же спрос."],
        ["You don't need to do anything to benefit from IQ Labs' growth. You just need to hold $IQ. The more builders choose the IQ SDK, the more relentless the deflation. That is the only promise that matters.",
         "IQ 랩스의 성장에서 혜택을 받기 위해 무언가 할 필요는 없습니다. $IQ를 들고 있으면 됩니다. 더 많은 빌더가 IQ SDK를 선택할수록 디플레이션은 더 집요해집니다. 그것이 중요한 유일한 약속입니다.",
         "Чтобы выигрывать от роста IQ Labs, делать ничего не нужно. Нужно просто держать $IQ. Чем больше билдеров выбирают IQ SDK, тем беспощаднее дефляция. Это единственное обещание, которое имеет значение."],
        ["PAY PER BYTE, PAY IN SOL", "바이트당 지불, SOL로 지불", "ПЛАТИ ЗА БАЙТ, ПЛАТИ В SOL"],
        ["100% ONCHAIN SPLIT", "100% 온체인 분배", "100% ОНЧЕЙН-СПЛИТ"],

        // ── ascii art generator page ──
        // ("Select Image" and "Art Generator" are left untranslated on purpose:
        //  art_generate.js rewrites those nodes at runtime and would revert them.)
        ["// ASCII ART GENERATOR", "// 아스키 아트 생성기", "// ГЕНЕРАТОР ASCII-АРТА"],
        ["TURN ANY IMAGE INTO TEXT ART", "어떤 이미지든 텍스트 아트로", "ЛЮБАЯ КАРТИНКА В ТЕКСТ-АРТ"],
        ["ADJUST. GENERATE. DOWNLOAD.", "조절. 생성. 다운로드.", "НАСТРОЙ. СГЕНЕРИРУЙ. СКАЧАЙ."],
        ["IQ TEXT-ART REMIX", "IQ 텍스트 아트 리믹스", "IQ ТЕКСТ-АРТ РЕМИКС"],
        ["HIGH IQ ART", "하이 IQ 아트", "HIGH IQ АРТ"],
        ["IMAGE → ASCII.", "이미지 → 아스키.", "КАРТИНКА → ASCII."],
        ["Turn any image into text art. Adjust the character size and spacing, drop the IQ logo on top, then generate and download your own ASCII remix.",
         "어떤 이미지든 텍스트 아트로 바꿔보세요. 글자 크기와 간격을 조절하고, IQ 로고를 얹은 뒤, 나만의 아스키 리믹스를 생성하고 다운로드하세요.",
         "Преврати любую картинку в текст-арт. Настрой размер и шаг символов, добавь логотип IQ, затем сгенерируй и скачай свой ASCII-ремикс."],
        ["// CONTROLS", "// 설정", "// НАСТРОЙКИ"],
        ["FONT SIZE", "글자 크기", "РАЗМЕР ШРИФТА"],
        ["SPACING", "간격", "ИНТЕРВАЛ"],
        ["IQ LOGO", "IQ 로고", "ЛОГОТИП IQ"],
        ["Smaller size packs in more characters.", "크기가 작을수록 더 많은 글자가 들어갑니다.", "Чем меньше размер, тем больше символов."],
        ["Distance between characters.", "글자 사이의 간격.", "Расстояние между символами."],
        ["Stamp the IQ logo onto the output.", "결과물에 IQ 로고를 찍습니다.", "Ставит логотип IQ на результат."],
        ["> Set your options, then select an image on the right to generate.",
         "> 옵션을 설정한 뒤, 오른쪽에서 이미지를 선택하면 생성됩니다.",
         "> Настрой опции, затем выбери картинку справа, чтобы сгенерировать."],
        ["RE-GENERATE", "다시 생성", "СГЕНЕРИРОВАТЬ СНОВА"],
        ["DOWNLOAD", "다운로드", "СКАЧАТЬ"],
        ["← HOME", "← 홈", "← ДОМОЙ"],
        ["← BACK TO HOME", "← 홈으로 돌아가기", "← НА ГЛАВНУЮ"]
    ];

    var LANG_IX = { ko: 1, ru: 2 };
    var maps = {};
    function dict(lang) {
        if (!maps[lang]) {
            var ix = LANG_IX[lang], m = {};
            STRINGS.forEach(function (row) { m[row[0]] = row[ix]; });
            maps[lang] = m;
        }
        return maps[lang];
    }

    function ensureFont(lang) {
        var f = FONTS[lang];
        if (!f) return;
        if (!document.getElementById("iq_i18n_faces")) {
            var s = document.createElement("style");
            s.id = "iq_i18n_faces";
            s.textContent = FACE_CSS;
            document.head.appendChild(s);
        }
        if (f.gcss && !document.getElementById("iq_font_" + lang)) {
            var l = document.createElement("link");
            l.id = "iq_font_" + lang;
            l.rel = "stylesheet";
            l.href = "https://fonts.googleapis.com/css2?family=" + f.gcss + "&display=swap";
            document.head.appendChild(l);
        }
    }

    // Titles (stacks led by Zen Dots) get the display font prepended so the
    // whole heading renders in it; body text gets the text font spliced in just
    // before the generic "monospace" so Latin keeps resolving to Kode Mono.
    function patchFont(el, lang) {
        var f = FONTS[lang];
        if (!f || !el || el.__iqFontLang === lang) return;
        if (el.__iqInlineFF === undefined) el.__iqInlineFF = el.style.fontFamily;
        var base = el.__iqBaseFF || (el.__iqBaseFF = getComputedStyle(el).fontFamily);
        if (/Zen Dots/i.test(base)) {
            el.style.fontFamily = f.title + ", " + base;
        } else {
            el.style.fontFamily = /monospace/i.test(base)
                ? base.replace(/monospace/i, f.body + ", monospace")
                : base + ", " + f.body;
        }
        el.__iqFontLang = lang;
    }

    // Hangul glyphs read optically larger than Latin caps at the same px, so
    // the hero display title gets a per-language size override. RU (Asrocuus)
    // is already width-fitted at the original size.
    var HERO_SIZE = { ko: "clamp(40px, calc(12.8vw - 12px), 240px)" };
    function tweakHero(lang) {
        var el = document.getElementById("rd_hero_title");
        if (!el) return;
        if (el.__iqSize === undefined) {
            el.__iqSize = el.style.fontSize;
            el.__iqLH = el.style.lineHeight;
        }
        var s = HERO_SIZE[lang];
        el.style.fontSize = s || el.__iqSize;
        el.style.lineHeight = s ? "1.02" : el.__iqLH;
    }

    function resetFont(el) {
        if (!el || el.__iqFontLang === undefined) return;
        el.style.fontFamily = el.__iqInlineFF || "";
        delete el.__iqFontLang;
    }

    function apply(lang) {
        var root = document.querySelector(".rd_root");
        if (!root) return;
        var d = lang === "en" ? null : dict(lang);
        var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
            acceptNode: function (n) {
                var p = n.parentNode && n.parentNode.nodeName;
                return (p === "STYLE" || p === "SCRIPT")
                    ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT;
            }
        });
        var n;
        while ((n = walker.nextNode())) {
            var orig = n.__iqOrig !== undefined ? n.__iqOrig : n.nodeValue;
            var key = orig.trim();
            if (!key) continue;
            var tr = d && d[key];
            if (tr === undefined || tr === null) {
                if (n.__iqOrig !== undefined) {
                    n.nodeValue = n.__iqOrig;
                    resetFont(n.parentElement);
                }
                continue;
            }
            if (n.__iqOrig === undefined) n.__iqOrig = orig;
            n.nodeValue = orig.replace(key, tr);
            patchFont(n.parentElement, lang);
        }
        tweakHero(lang);
        var btn = document.getElementById("rd_lang_btn");
        if (btn) btn.textContent = "[" + lang.toUpperCase() + " ▾]";
    }

    var iqLang = {
        current: function () { try { return localStorage.getItem(LS_KEY) || "en"; } catch (e) { return "en"; } },
        set: function (lang) {
            try { localStorage.setItem(LS_KEY, lang); } catch (e) { }
            ensureFont(lang);
            apply(lang);
            var m = document.getElementById("rd_lang_menu");
            if (m) m.style.display = "none";
        },
        toggle: function () {
            var m = document.getElementById("rd_lang_menu");
            if (m) m.style.display = m.style.display === "none" ? "block" : "none";
        },
        // Call after every template render: re-injected markup is English again.
        applySaved: function () {
            var lang = iqLang.current();
            if (lang !== "en") ensureFont(lang);
            apply(lang);
        }
    };
    window.iqLang = iqLang;

    document.addEventListener("click", function (e) {
        var box = document.getElementById("rd_lang");
        var m = document.getElementById("rd_lang_menu");
        if (m && m.style.display !== "none" && box && !box.contains(e.target)) {
            m.style.display = "none";
        }
    });
})();
