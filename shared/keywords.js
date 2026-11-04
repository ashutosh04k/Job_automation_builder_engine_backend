// backend/shared/keywords.js
// Single source of truth for skill keywords and matching.

export const SKILLS = [
  // Languages
  { label: 'JavaScript', group: 'general', aliases: ['javascript', 'es6'] },
  { label: 'TypeScript', group: 'general', aliases: ['typescript'] },
  { label: 'Python', group: 'backend', aliases: ['python'] },
  { label: 'Java', group: 'backend', aliases: ['java'] },
  { label: 'C++', group: 'general', aliases: ['c++'] },

  // Frontend
  { label: 'React.js', group: 'frontend', aliases: ['react.js', 'reactjs', 'react'] },
  { label: 'Next.js', group: 'frontend', aliases: ['next.js', 'nextjs'] },
  { label: 'Redux', group: 'frontend', aliases: ['redux', 'redux toolkit'] },
  { label: 'RTK Query', group: 'frontend', aliases: ['rtk query'] },
  { label: 'Tailwind CSS', group: 'frontend', aliases: ['tailwind css', 'tailwind'] },
  { label: 'Material UI', group: 'frontend', aliases: ['material ui', 'material-ui', 'mui'] },
  { label: 'HTML5', group: 'frontend', aliases: ['html5', 'html'] },
  { label: 'CSS3', group: 'frontend', aliases: ['css3', 'css'] },
  { label: 'Angular', group: 'frontend', aliases: ['angular'] },

  // Backend
  { label: 'Node.js', group: 'backend', aliases: ['node.js', 'nodejs', 'node'] },
  { label: 'Express.js', group: 'backend', aliases: ['express.js', 'expressjs', 'express'] },
  { label: 'REST APIs', group: 'backend', aliases: ['rest apis', 'rest api', 'restful'] },
  { label: 'GraphQL', group: 'backend', aliases: ['graphql'] },
  { label: 'WebSockets', group: 'backend', aliases: ['websockets', 'websocket'] },
  { label: 'Microservices', group: 'backend', aliases: ['microservices'] },

  // Databases
  { label: 'MongoDB', group: 'backend', aliases: ['mongodb', 'mongo'] },
  { label: 'SQL', group: 'backend', aliases: ['sql'] },
  { label: 'PostgreSQL', group: 'backend', aliases: ['postgresql', 'postgres'] },
  { label: 'MySQL', group: 'backend', aliases: ['mysql'] },
  { label: 'Redis', group: 'backend', aliases: ['redis'] },

  // Cloud / DevOps
  { label: 'AWS', group: 'devops', aliases: ['aws', 'ec2', 's3'] },
  { label: 'Docker', group: 'devops', aliases: ['docker'] },
  { label: 'Kubernetes', group: 'devops', aliases: ['kubernetes', 'k8s'] },
  { label: 'CI/CD', group: 'devops', aliases: ['ci/cd', 'ci-cd'] },
  { label: 'GitHub Actions', group: 'devops', aliases: ['github actions'] },
  { label: 'Nginx', group: 'devops', aliases: ['nginx'] },
  { label: 'Firebase', group: 'devops', aliases: ['firebase'] },
  { label: 'Git', group: 'general', aliases: ['git'] },

  // Testing
  { label: 'Jest', group: 'testing', aliases: ['jest'] },
  { label: 'React Testing Library', group: 'testing', aliases: ['react testing library'] },
  { label: 'Cypress', group: 'testing', aliases: ['cypress'] },
  { label: 'Playwright', group: 'testing', aliases: ['playwright'] },

  // AI
  { label: 'LLM', group: 'ai', aliases: ['llm', 'llms', 'large language model'] },
  { label: 'RAG', group: 'ai', aliases: ['rag', 'retrieval-augmented generation', 'retrieval augmented generation'] },
  { label: 'LangChain', group: 'ai', aliases: ['langchain'] },

  // Engineering
  { label: 'RBAC', group: 'general', aliases: ['rbac', 'role-based access'] },
  { label: 'Stripe', group: 'backend', aliases: ['stripe'] },
  { label: 'SEO', group: 'frontend', aliases: ['seo'] },

  // More languages / frameworks
  { label: 'Go', group: 'backend', aliases: ['golang'] },
  { label: 'Rust', group: 'backend', aliases: ['rust'] },
  { label: 'C#', group: 'backend', aliases: ['c#', '.net', 'asp.net'] },
  { label: 'PHP', group: 'backend', aliases: ['php', 'laravel'] },
  { label: 'Ruby on Rails', group: 'backend', aliases: ['ruby on rails', 'rails', 'ruby'] },
  { label: 'Kotlin', group: 'general', aliases: ['kotlin'] },
  { label: 'Swift', group: 'general', aliases: ['swift'] },
  { label: 'Spring Boot', group: 'backend', aliases: ['spring boot', 'spring'] },
  { label: 'Django', group: 'backend', aliases: ['django'] },
  { label: 'Flask', group: 'backend', aliases: ['flask'] },
  { label: 'FastAPI', group: 'backend', aliases: ['fastapi'] },
  { label: 'NestJS', group: 'backend', aliases: ['nestjs', 'nest.js'] },
  { label: 'Vue.js', group: 'frontend', aliases: ['vue.js', 'vuejs', 'vue'] },
  { label: 'Svelte', group: 'frontend', aliases: ['svelte', 'sveltekit'] },
  { label: 'React Native', group: 'frontend', aliases: ['react native'] },
  { label: 'Flutter', group: 'frontend', aliases: ['flutter'] },
  { label: 'jQuery', group: 'frontend', aliases: ['jquery'] },
  { label: 'Bootstrap', group: 'frontend', aliases: ['bootstrap'] },
  { label: 'SASS', group: 'frontend', aliases: ['sass', 'scss'] },
  { label: 'Zustand', group: 'frontend', aliases: ['zustand'] },
  { label: 'Webpack', group: 'frontend', aliases: ['webpack'] },
  { label: 'Vite', group: 'frontend', aliases: ['vite'] },
  { label: 'Storybook', group: 'frontend', aliases: ['storybook'] },
  { label: 'Figma', group: 'frontend', aliases: ['figma'] },
  { label: 'Accessibility', group: 'frontend', aliases: ['accessibility', 'a11y', 'wcag', 'aria'] },
  { label: 'Responsive Design', group: 'frontend', aliases: ['responsive design', 'responsive web design', 'mobile-first'] },
  { label: 'Server-Side Rendering', group: 'frontend', aliases: ['server-side rendering', 'server side rendering', 'ssr'] },
  { label: 'PWA', group: 'frontend', aliases: ['pwa', 'progressive web app', 'service workers', 'service worker'] },
  { label: 'Web Performance', group: 'frontend', aliases: ['web performance', 'core web vitals', 'lighthouse', 'performance optimization', 'code splitting', 'lazy loading'] },

  // Backend / data
  { label: 'Mongoose', group: 'backend', aliases: ['mongoose'] },
  { label: 'Prisma', group: 'backend', aliases: ['prisma'] },
  { label: 'Socket.IO', group: 'backend', aliases: ['socket.io'] },
  { label: 'Kafka', group: 'backend', aliases: ['kafka'] },
  { label: 'RabbitMQ', group: 'backend', aliases: ['rabbitmq'] },
  { label: 'Elasticsearch', group: 'backend', aliases: ['elasticsearch', 'opensearch'] },
  { label: 'DynamoDB', group: 'backend', aliases: ['dynamodb'] },
  { label: 'JWT', group: 'backend', aliases: ['jwt', 'json web token'] },
  { label: 'OAuth', group: 'backend', aliases: ['oauth', 'oauth2', 'oauth 2.0'] },
  { label: 'System Design', group: 'general', aliases: ['system design', 'scalable architecture', 'distributed systems'] },

  // Cloud / DevOps / tooling
  { label: 'Azure', group: 'devops', aliases: ['azure'] },
  { label: 'GCP', group: 'devops', aliases: ['gcp', 'google cloud'] },
  { label: 'AWS Lambda', group: 'devops', aliases: ['aws lambda', 'lambda', 'serverless'] },
  { label: 'Terraform', group: 'devops', aliases: ['terraform'] },
  { label: 'Linux', group: 'devops', aliases: ['linux', 'bash', 'shell scripting'] },
  { label: 'Vercel', group: 'devops', aliases: ['vercel'] },
  { label: 'Jenkins', group: 'devops', aliases: ['jenkins'] },
  { label: 'Monitoring', group: 'devops', aliases: ['sentry', 'grafana', 'prometheus', 'datadog', 'new relic'] },

  // Testing
  { label: 'Vitest', group: 'testing', aliases: ['vitest'] },
  { label: 'Mocha', group: 'testing', aliases: ['mocha', 'chai'] },
  { label: 'Selenium', group: 'testing', aliases: ['selenium'] },
  { label: 'Unit Testing', group: 'testing', aliases: ['unit testing', 'unit tests', 'tdd', 'test-driven'] },
  { label: 'API Testing', group: 'testing', aliases: ['api testing', 'postman'] },

  // Practices
  { label: 'Data Structures & Algorithms', group: 'general', aliases: ['data structures', 'algorithms', 'dsa'] },
  { label: 'OOP', group: 'general', aliases: ['oop', 'oops', 'object-oriented', 'object oriented'] },
  { label: 'Agile', group: 'general', aliases: ['agile', 'scrum', 'kanban', 'sprint'] },
  { label: 'Jira', group: 'general', aliases: ['jira'] },
  { label: 'Confluence', group: 'general', aliases: ['confluence'] },

  // More frontend
  { label: 'Redux Saga', group: 'frontend', aliases: ['redux-saga', 'redux saga'] },
  { label: 'Styled Components', group: 'frontend', aliases: ['styled-components', 'styled components'] },
  { label: 'Ant Design', group: 'frontend', aliases: ['ant design', 'antd'] },
  { label: 'Chakra UI', group: 'frontend', aliases: ['chakra ui', 'chakra-ui'] },
  { label: 'Nuxt.js', group: 'frontend', aliases: ['nuxt.js', 'nuxtjs', 'nuxt'] },
  { label: 'Gatsby', group: 'frontend', aliases: ['gatsby'] },
  { label: 'D3.js', group: 'frontend', aliases: ['d3.js', 'd3js'] },
  { label: 'Three.js', group: 'frontend', aliases: ['three.js', 'threejs'] },
  { label: 'Chart.js', group: 'frontend', aliases: ['chart.js', 'chartjs', 'recharts', 'highcharts'] },
  { label: 'Electron', group: 'frontend', aliases: ['electron.js', 'electronjs', 'electron'] },
  { label: 'Babel', group: 'frontend', aliases: ['babel'] },
  { label: 'ESLint', group: 'frontend', aliases: ['eslint', 'prettier'] },
  { label: 'Google Maps API', group: 'frontend', aliases: ['google maps', 'maps api', 'mapbox', 'leaflet'] },

  // More backend
  { label: 'Hibernate', group: 'backend', aliases: ['hibernate', 'jpa'] },
  { label: 'gRPC', group: 'backend', aliases: ['grpc'] },
  { label: 'Celery', group: 'backend', aliases: ['celery'] },
  { label: 'Sequelize', group: 'backend', aliases: ['sequelize'] },
  { label: 'TypeORM', group: 'backend', aliases: ['typeorm'] },
  { label: 'Apollo GraphQL', group: 'backend', aliases: ['apollo graphql', 'apollo client', 'apollo server'] },
  { label: 'tRPC', group: 'backend', aliases: ['trpc'] },
  { label: 'Event-Driven Architecture', group: 'backend', aliases: ['event-driven architecture', 'event-driven', 'event driven'] },
  { label: 'Message Queues', group: 'backend', aliases: ['message queues', 'message queue', 'message broker', 'aws sqs', 'sqs', 'pub/sub', 'bullmq'] },
  { label: 'Cassandra', group: 'backend', aliases: ['cassandra'] },
  { label: 'SQLite', group: 'backend', aliases: ['sqlite'] },
  { label: 'Oracle DB', group: 'backend', aliases: ['oracle database', 'oracle db', 'pl/sql', 'plsql'] },
  { label: 'SQL Server', group: 'backend', aliases: ['sql server', 'mssql', 't-sql'] },
  { label: 'MariaDB', group: 'backend', aliases: ['mariadb'] },
  { label: 'Supabase', group: 'backend', aliases: ['supabase'] },
  { label: 'Neo4j', group: 'backend', aliases: ['neo4j'] },
  { label: 'Design Patterns', group: 'general', aliases: ['design patterns', 'solid principles'] },
  { label: 'MVC', group: 'general', aliases: ['mvc'] },
  { label: 'Multithreading', group: 'general', aliases: ['multithreading', 'multi-threading', 'concurrency'] },
  { label: 'Scala', group: 'backend', aliases: ['scala'] },
  { label: 'Dart', group: 'general', aliases: ['dart'] },

  // Data / analytics
  { label: 'Pandas', group: 'data', aliases: ['pandas'] },
  { label: 'NumPy', group: 'data', aliases: ['numpy'] },
  { label: 'Apache Spark', group: 'data', aliases: ['apache spark', 'pyspark', 'spark sql'] },
  { label: 'Airflow', group: 'data', aliases: ['apache airflow', 'airflow'] },
  { label: 'dbt', group: 'data', aliases: ['dbt'] },
  { label: 'Snowflake', group: 'data', aliases: ['snowflake'] },
  { label: 'BigQuery', group: 'data', aliases: ['bigquery'] },
  { label: 'Redshift', group: 'data', aliases: ['redshift'] },
  { label: 'ETL', group: 'data', aliases: ['etl', 'elt', 'data pipelines', 'data pipeline'] },
  { label: 'Tableau', group: 'data', aliases: ['tableau'] },
  { label: 'Power BI', group: 'data', aliases: ['power bi', 'powerbi'] },
  { label: 'Excel', group: 'data', aliases: ['ms excel', 'microsoft excel', 'advanced excel'] },

  // AI / ML
  { label: 'Machine Learning', group: 'ai', aliases: ['machine learning'] },
  { label: 'Deep Learning', group: 'ai', aliases: ['deep learning', 'neural networks'] },
  { label: 'TensorFlow', group: 'ai', aliases: ['tensorflow', 'keras'] },
  { label: 'PyTorch', group: 'ai', aliases: ['pytorch'] },
  { label: 'scikit-learn', group: 'ai', aliases: ['scikit-learn', 'sklearn'] },
  { label: 'NLP', group: 'ai', aliases: ['nlp', 'natural language processing'] },
  { label: 'Computer Vision', group: 'ai', aliases: ['computer vision', 'opencv'] },
  { label: 'OpenAI API', group: 'ai', aliases: ['openai', 'gpt-4', 'gpt-4o', 'chatgpt api'] },
  { label: 'Hugging Face', group: 'ai', aliases: ['hugging face', 'huggingface'] },
  { label: 'Vector Databases', group: 'ai', aliases: ['vector database', 'vector databases', 'vector db', 'pinecone', 'weaviate', 'pgvector', 'faiss', 'chromadb'] },
  { label: 'Prompt Engineering', group: 'ai', aliases: ['prompt engineering'] },
  { label: 'LlamaIndex', group: 'ai', aliases: ['llamaindex', 'llama index'] },
  { label: 'AI Agents', group: 'ai', aliases: ['ai agents', 'ai agent', 'agentic'] },
  { label: 'MLOps', group: 'ai', aliases: ['mlops'] },

  // More cloud / DevOps
  { label: 'Ansible', group: 'devops', aliases: ['ansible'] },
  { label: 'Helm', group: 'devops', aliases: ['helm'] },
  { label: 'CloudFormation', group: 'devops', aliases: ['cloudformation'] },
  { label: 'AWS ECS', group: 'devops', aliases: ['aws ecs', 'ecs', 'fargate'] },
  { label: 'Azure DevOps', group: 'devops', aliases: ['azure devops'] },
  { label: 'GitLab CI', group: 'devops', aliases: ['gitlab ci', 'gitlab'] },
  { label: 'Bitbucket', group: 'devops', aliases: ['bitbucket'] },
  { label: 'Cloudflare', group: 'devops', aliases: ['cloudflare', 'cloudfront', 'cdn'] },
  { label: 'Heroku', group: 'devops', aliases: ['heroku'] },
  { label: 'Netlify', group: 'devops', aliases: ['netlify'] },
  { label: 'ELK Stack', group: 'devops', aliases: ['elk stack', 'kibana', 'logstash'] },
  { label: 'Load Balancing', group: 'devops', aliases: ['load balancing', 'load balancer', 'load balancers'] },

  // Mobile
  { label: 'Android', group: 'mobile', aliases: ['android'] },
  { label: 'iOS', group: 'mobile', aliases: ['ios'] },
  { label: 'Jetpack Compose', group: 'mobile', aliases: ['jetpack compose'] },
  { label: 'SwiftUI', group: 'mobile', aliases: ['swiftui'] },

  // More testing
  { label: 'JUnit', group: 'testing', aliases: ['junit'] },
  { label: 'PyTest', group: 'testing', aliases: ['pytest'] },
  { label: 'TestNG', group: 'testing', aliases: ['testng'] },
  { label: 'Appium', group: 'testing', aliases: ['appium'] },
  { label: 'Puppeteer', group: 'testing', aliases: ['puppeteer'] },
  { label: 'Load Testing', group: 'testing', aliases: ['load testing', 'jmeter', 'k6', 'locust'] }
];

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Whole-token boundaries: "ai" won't match "email", "java" won't match "javascript".
const BEFORE = '(?<![a-z0-9+#])';
const AFTER = '(?![a-z0-9+#])';

const regexCache = new Map();
function termRegex(term, flags = 'i') {
  const key = `${term}|${flags}`;
  if (!regexCache.has(key)) {
    regexCache.set(key, new RegExp(`${BEFORE}${escapeRegex(term)}${AFTER}`, flags));
  }
  const re = regexCache.get(key);
  re.lastIndex = 0; // global regexes keep state between calls
  return re;
}

export function hasTerm(text = '', term = '') {
  if (!text || !term) return false;
  return termRegex(term.toLowerCase()).test(text);
}

export function hasSkill(text = '', skill) {
  return skill.aliases.some((a) => hasTerm(text, a));
}

// All aliases, longest first, so "react native" is consumed before "react".
const ALIAS_INDEX = SKILLS
  .flatMap((skill) => skill.aliases.map((alias) => ({ alias: alias.toLowerCase(), skill })))
  .sort((a, b) => b.alias.length - a.alias.length);

/**
 * Non-overlapping skill mentions in the text, longest alias first.
 * @returns {{ start: number, end: number, text: string, skill: object }[]} sorted by start
 */
export function findSkillSpans(text = '') {
  const src = String(text || '');
  let rest = src;
  const spans = [];
  for (const { alias, skill } of ALIAS_INDEX) {
    const re = termRegex(alias, 'gi');
    let m;
    while ((m = re.exec(rest))) {
      spans.push({ start: m.index, end: m.index + m[0].length, text: src.slice(m.index, m.index + m[0].length), skill });
    }
    rest = rest.replace(termRegex(alias, 'gi'), (x) => ' '.repeat(x.length));
  }
  return spans.sort((a, b) => a.start - b.start);
}

/**
 * Skills mentioned in the text, in SKILLS order. A span matched by a longer
 * alias is blanked out, so "React Native" does not also count as "React.js".
 */
export function extractSkills(text = '') {
  if (!text) return [];
  let rest = String(text);
  const found = new Set();
  for (const { alias, skill } of ALIAS_INDEX) {
    const re = termRegex(alias, 'gi');
    if (re.test(rest)) {
      found.add(skill);
      rest = rest.replace(termRegex(alias, 'gi'), (m) => ' '.repeat(m.length));
    }
  }
  return SKILLS.filter((s) => found.has(s));
}

/** How many of the given skills appear in the text. Used for ranking bullets/projects. */
export function countMatches(text = '', skills = []) {
  return skills.reduce((n, s) => n + (hasSkill(text, s) ? 1 : 0), 0);
}

/** Find a SKILLS entry for a free-text item like "Express.js" or "Tailwind CSS". */
export function findSkill(item = '') {
  return SKILLS.find((s) => s.label.toLowerCase() === item.toLowerCase() || hasSkill(item, s)) || null;
}

/** 'frontend' | 'backend' | 'fullstack', decided by weighted counts, not a single substring. */
export function detectRoleFocus(title = '', jd = '') {
  const t = title.toLowerCase();
  if (/\b(full[\s-]?stack|mern)\b/.test(t)) return 'fullstack';
  if (/\b(front[\s-]?end|react|ui)\b/.test(t)) return 'frontend';
  if (/\b(back[\s-]?end|node|api)\b/.test(t)) return 'backend';

  const found = extractSkills(jd);
  const fe = found.filter((s) => s.group === 'frontend').length;
  const be = found.filter((s) => s.group === 'backend').length;
  if (fe >= be * 2 && fe > 0) return 'frontend';
  if (be >= fe * 2 && be > 0) return 'backend';
  return 'fullstack';
}

/** Wrap matched skill mentions in **...** for bold rendering. Longest alias wins. */
export function highlightSkills(text = '', skills = []) {
  if (!text || skills.length === 0) return text;
  const aliases = skills
    .flatMap((s) => s.aliases)
    .sort((a, b) => b.length - a.length)
    .map(escapeRegex);
  const re = new RegExp(`${BEFORE}(?:${aliases.join('|')})${AFTER}`, 'gi');
  return text.replace(re, (m) => `**${m}**`);
}

/**
 * How the text itself spells a skill (e.g. "ReactJS", "Node"), or null.
 * Longest alias first so "React Native" isn't reported as "React".
 */
export function surfaceForm(text = '', skill) {
  if (!text || !skill) return null;
  const aliases = [...skill.aliases].sort((a, b) => b.length - a.length);
  for (const a of aliases) {
    const m = text.match(termRegex(a.toLowerCase(), 'i'));
    if (m) return m[0];
  }
  return null;
}
