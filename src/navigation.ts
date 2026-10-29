import screens from './screens.json';
const textMatch = (pattern: RegExp) => screens.find(s => pattern.test(s.name))?.route;

export function destination(label: string, category: string): string | undefined {
  const t = label.trim().toLowerCase();
  const common: Record<string, string | undefined> = {
    'flurrypay': '/', 'flurrypay business': '/', 'home': '/', 'home page': '/',
    'products': '/products/multi-currency-accounts', 'solutions': '/solutions', 'pricing': '/pricing', 'resources': '/resources',
    'developers': category === 'website' ? '/developers' : '/merchant/developers',
    'contact': '/contact', 'contact us': '/contact', 'contact sales': '/contact', 'talk to an expert': '/contact',
    'log in': '/login', 'login': '/login', 'sign in': '/login', 'get started': '/register',
    'create account': '/register', 'create free account': '/register', 'sign up': '/register',
    'forgot password?': '/forgot-password', 'forgot password': '/forgot-password',
    'overview': category === 'admin' ? '/admin' : '/merchant', 'dashboard': category === 'admin' ? '/admin' : '/merchant',
    'payment links': '/merchant/payment-links', 'transactions': category === 'admin' ? textMatch(/^Payments: Transactions/) : '/merchant/transactions',
    'wallets': category === 'admin' ? textMatch(/^Wallet: Liquidity/) : '/merchant/wallets', 'wallet': category === 'admin' ? textMatch(/^Wallet: Liquidity/) : '/merchant/wallets', 'settings': category === 'admin' ? textMatch(/^Settings: General/) : '/merchant/settings',
    'team': textMatch(/^Team Directory/), 'team management': category === 'admin' ? textMatch(/^Settings: Team Management/) : textMatch(/^Team Directory/),
    'otc desk': category === 'website' ? textMatch(/^OTC Desk -/) : textMatch(/^OTC Desk Dashboard/),
    'crypto': category === 'admin' ? textMatch(/^Crypto: Assets/) : textMatch(/^Crypto Dashboard/), 'trade history': textMatch(/^Trade History/),
    'buy crypto': textMatch(/^Buy Crypto/), 'sell crypto': textMatch(/^Sell Crypto/),
    'send crypto': textMatch(/^Send Crypto Assets/), 'send': textMatch(/^Send Crypto Assets/),
    'create payment link': '/merchant/payment-links/create', 'create new link': '/merchant/payment-links/create',
    'create link': textMatch(/^Payment Link Ready/), 'add wallet': textMatch(/^Add New Wallet - Redesigned/),
    'add new wallet': textMatch(/^Add New Wallet - Redesigned/), 'quick exchange': textMatch(/^Quick Exchange/),
    'exchange': textMatch(/^Quick Exchange/), 'request quote': textMatch(/^Request OTC Quote/),
    'request otc quote': textMatch(/^Request OTC Quote/), 'invite member': textMatch(/^Invite Team Member/),
    'invite team member': textMatch(/^Invite Team Member/), 'create api key': textMatch(/^Create New API Key/),
    'create new api key': textMatch(/^Create New API Key/), 'api documentation': '/developers',
    'explore api documentation': '/developers', 'documentation': '/developers',
    'multi-currency accounts': '/products/multi-currency-accounts', 'multi-currency account': '/products/multi-currency-accounts',
    'cross-border payments': textMatch(/^Cross-border Payments/), 'global payouts': textMatch(/^Global Payouts/),
    'merchant gateway': textMatch(/^Merchant Gateway/), 'digital wallets': textMatch(/^Digital Wallet Services/),
    'digital wallet services': textMatch(/^Digital Wallet Services/), 'merchants': textMatch(/^Merchant Management/),
    'merchant management': textMatch(/^Merchant Management/), 'users': textMatch(/^User Management/),
    'payments': category === 'admin' ? textMatch(/^Payments: Overview/) : textMatch(/^Merchant Gateway/), 'treasury': textMatch(/^Treasury: Overview/), 'activity logs': textMatch(/^Activity Logs: Global Ledger/), 'compliance': textMatch(/^Merchant Detail: Compliance/), 'user management': textMatch(/^User Management/), 'logout': textMatch(/^Logout Confirmation/), 'log out': textMatch(/^Logout Confirmation/),
  };
  return common[t];
}


export function contextualDestination(label: string, currentRoute: string, category: string, nav = false): string | undefined {
  const t = label.toLowerCase().replace(/\s+/g, ' ').trim().replace(/\s+\d+$/, '');
  const find = (pattern: RegExp) => screens.find(s => pattern.test(s.name))?.route;
  const admin = category === 'admin';
  const group = currentRoute.split('/')[2];
  const aliases: Record<string, string | undefined> = {
    'support': '/resources', 'help center': '/resources', 'visit help center': '/resources', '24/7 support': '/contact', 'view guide': '/resources/guides', 'teams': find(/^Team Directory/), 'customers': admin ? find(/^User Management/) : find(/^Team Directory/),
    'back to login': '/login', 'get started now': '/register', 'start scaling': '/register', 'start integrating': '/register',
    'start transfer': '/register', 'create wallet': find(/^Add New Wallet - Redesigned/), 'start coding now': '/register', 'create my wallet': '/register', 'schedule demo': '/contact',
    'talk to sales': '/contact', 'speak to a trader': '/contact', 'contact support': '/contact', 'contact dev support': '/contact',
    'view api docs': '/developers', 'read documentation': '/developers', 'explore documentation': '/developers',
    'explore api docs': '/developers', 'explore docs': '/developers', 'api reference': '/developers', 'docs': '/developers',
    'get api keys': '/merchant/developers', 'launch sandbox': '/merchant/developers',
    'view all transactions': '/merchant/transactions', 'view all integrations': '/merchant/developers',
    'new payment': '/merchant/payment-links/create', 'create new key': find(/^Create New API Key/), 'create new api key': find(/^Create New API Key/),
    'new endpoint': '/merchant/html-body',
    'webhooks': admin ? find(/^Developer: Webhook/) : '/merchant/html-body',
    'api keys': admin ? find(/^Developer: API Management/) : '/merchant/developers',
    'api logs': find(/^Developer: API Audit/), 'documentation settings': find(/^Developer: Portal Settings/),
    'business profile': '/merchant/settings', 'team management': admin ? find(/^Settings: Team/) : find(/^Team Directory/),
    'general': find(/^Settings: General/), 'security': admin ? find(/^Settings: Security/) : '/merchant/settings',
    'roles & permissions': admin ? find(/^Settings: Roles/) : find(/^Role Permissions/),
    'asset allocation': find(/^Treasury: Asset/), 'yield management': find(/^Treasury: Yield/),
    'assets': admin ? find(/^Crypto: Assets/) : find(/^Crypto Dashboard/),
    'history': admin ? find(/^Crypto: History/) : find(/^Trade History/), 'trading': admin ? '/admin/html-body' : find(/^Institutional Buy/),
    'settlement accounts': find(/^Wallet: Settlement Accounts/), 'treasury holdings': find(/^Wallet: Treasury/),
    'settlement transactions': find(/^Wallet: Settlement Transactions/),
    'global activities': find(/^Activity Logs: Global/), 'admin actions': find(/^Activity Logs: Admin/), 'merchants actions': find(/^Activity Logs: Admin/), 'system logs': find(/^Activity Logs: System/),
    'multi-currency': '/products/multi-currency-accounts', 'cross-border': find(/^Cross-border Payments/),
    'global deposits': find(/^Wallet: Settlement Accounts/), 'global payments': find(/^Global Payouts/), 'otc': find(/^OTC Desk Dashboard/),
    'e-commerce': '/solutions', 'saas platform': '/solutions', 'marketplaces': '/solutions', 'embedded finance': '/solutions', 'card issuing': '/solutions',
    'view live spreads': find(/^OTC Desk Dashboard/), 'view all endpoints': admin ? find(/^Developer: Webhook/) : '/merchant/developers',
    'invite member': find(/^Invite Team Member/), 'new admin': find(/^Invite Team Member/),
    'crypto': admin ? find(/^Crypto: Assets/) : find(/^Crypto Dashboard/),
  };
  if (/^overview$/.test(t) && !nav) {
    if (admin && group === 'payments') return find(/^Payments: Overview/);
    if (admin && group === 'treasury') return find(/^Treasury: Overview/);
  }
  if (admin && /^(transactions|payouts|disputes)$/.test(t) && currentRoute.includes('payments')) return find(new RegExp('^Payments: ' + t, 'i'));
  if (admin && /^(overview|transactions|wallets & balances|compliance)$/.test(t) && currentRoute.includes('merchant-detail')) return find(new RegExp('^Merchant Detail: ' + (t === 'wallets & balances' ? 'Wallets' : t), 'i'));
  if (t === 'otc desk' && admin) return find(/^Crypto: OTC/);
  if (t === 'developers' && admin) return find(/^Developer: API Management/);
  if (t === 'settings' && admin && currentRoute.includes('/wallet-')) return find(/^Wallet: Settings/);
  if (t === 'create link' && !currentRoute.includes('/create')) return '/merchant/payment-links/create';
  return aliases[t] || destination(label, category);
}
