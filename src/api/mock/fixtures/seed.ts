/**
 * Shared seed for every mock domain, so ids line up across screens: a client in
 * the Clients list is the same one a notification links to, the same one search
 * finds, and the same email an order or subscription belongs to.
 *
 * All businesses and people are fictional (Hamilton, Ottawa and the rest of
 * Ontario). Domains use `.test` style made-up names so nothing points at a real company.
 */

export type SeedClient = {
  id: string;
  businessName: string;
  contactName: string;
  email: string;
  phone: string;
  city: string;
  industry: string;
  website: string;
  /** Plan id: convert | grow | lets-talk | webline | null */
  planId: 'convert' | 'grow' | 'lets-talk' | 'webline' | null;
  status: 'lead' | 'pending' | 'onboarding' | 'live' | 'paused' | 'churned';
  isTest: boolean;
  /** Days since the client was created. */
  ageDays: number;
};

export const SEED_CLIENTS: SeedClient[] = [
  { id: 'cl_acmeplumb01', businessName: 'Acme Plumbing', contactName: 'Daniel Okafor', email: 'dan@acmeplumbing.test', phone: '+19055550142', city: 'Hamilton', industry: 'Plumbing', website: 'https://acmeplumbing.test', planId: 'grow', status: 'onboarding', isTest: false, ageDays: 19 },
  { id: 'cl_harbourhvac', businessName: 'Harbour HVAC', contactName: 'Priya Raman', email: 'priya@harbourhvac.test', phone: '+19055550177', city: 'Burlington', industry: 'HVAC', website: 'https://harbourhvac.test', planId: 'lets-talk', status: 'live', isTest: false, ageDays: 96 },
  { id: 'cl_bytownroof', businessName: 'Bytown Roofing Co.', contactName: 'Marc Lalonde', email: 'marc@bytownroofing.test', phone: '+16135550190', city: 'Ottawa', industry: 'Roofing', website: 'https://bytownroofing.test', planId: 'grow', status: 'live', isTest: false, ageDays: 74 },
  { id: 'cl_escarpdent', businessName: 'Escarpment Family Dental', contactName: 'Dr. Leah Morrison', email: 'leah@escarpmentdental.test', phone: '+19055550111', city: 'Hamilton', industry: 'Dental clinic', website: 'https://escarpmentdental.test', planId: 'convert', status: 'live', isTest: false, ageDays: 151 },
  { id: 'cl_rideaulawn', businessName: 'Rideau Lawn & Garden', contactName: 'Tom Becker', email: 'tom@rideaulawn.test', phone: '+16135550123', city: 'Ottawa', industry: 'Landscaping', website: 'https://rideaulawn.test', planId: 'grow', status: 'onboarding', isTest: false, ageDays: 33 },
  { id: 'cl_steeltownph', businessName: 'Steeltown Physio', contactName: 'Aisha Khan', email: 'aisha@steeltownphysio.test', phone: '+19055550188', city: 'Hamilton', industry: 'Physiotherapy', website: 'https://steeltownphysio.test', planId: 'webline', status: 'onboarding', isTest: false, ageDays: 9 },
  { id: 'cl_glebelaw', businessName: 'Glebe Legal LLP', contactName: 'Catherine Dubois', email: 'cdubois@glebelegal.test', phone: '+16135550166', city: 'Ottawa', industry: 'Law firm', website: 'https://glebelegal.test', planId: 'lets-talk', status: 'live', isTest: false, ageDays: 212 },
  { id: 'cl_dundaselec', businessName: 'Dundas Electric', contactName: 'Kevin Walsh', email: 'kevin@dundaselectric.test', phone: '+19055550135', city: 'Dundas', industry: 'Electrician', website: 'https://dundaselectric.test', planId: 'grow', status: 'pending', isTest: false, ageDays: 2 },
  { id: 'cl_kanatapest', businessName: 'Kanata Pest Control', contactName: 'Hugo Tremblay', email: 'hugo@kanatapest.test', phone: '+16135550147', city: 'Kanata', industry: 'Pest control', website: 'https://kanatapest.test', planId: 'convert', status: 'paused', isTest: false, ageDays: 128 },
  { id: 'cl_lakeshorecl', businessName: 'Lakeshore Cleaning', contactName: 'Sofia Alvarez', email: 'sofia@lakeshorecleaning.test', phone: '+19055550199', city: 'Stoney Creek', industry: 'Cleaning', website: 'https://lakeshorecleaning.test', planId: 'grow', status: 'onboarding', isTest: false, ageDays: 41 },
  { id: 'cl_byward_cafe', businessName: 'ByWard Catering', contactName: 'Nadia Haddad', email: 'nadia@bywardcatering.test', phone: '+16135550108', city: 'Ottawa', industry: 'Catering', website: 'https://bywardcatering.test', planId: 'webline', status: 'live', isTest: false, ageDays: 63 },
  { id: 'cl_ancastermov', businessName: 'Ancaster Movers', contactName: 'Jordan Pike', email: 'jordan@ancastermovers.test', phone: '+19055550155', city: 'Ancaster', industry: 'Moving', website: 'https://ancastermovers.test', planId: 'grow', status: 'live', isTest: false, ageDays: 88 },
  { id: 'cl_orleansauto', businessName: 'Orleans Auto Detailing', contactName: 'Samir Patel', email: 'samir@orleansauto.test', phone: '+16135550171', city: 'Orleans', industry: 'Auto detailing', website: 'https://orleansauto.test', planId: null, status: 'lead', isTest: false, ageDays: 1 },
  { id: 'cl_westdalevet', businessName: 'Westdale Vet Clinic', contactName: 'Dr. Emma Clarke', email: 'emma@westdalevet.test', phone: '+19055550129', city: 'Hamilton', industry: 'Veterinary', website: 'https://westdalevet.test', planId: 'convert', status: 'churned', isTest: false, ageDays: 260 },
  { id: 'cl_barrhavenhm', businessName: 'Barrhaven Home Renovations', contactName: 'Luc Gagnon', email: 'luc@barrhavenreno.test', phone: '+16135550184', city: 'Barrhaven', industry: 'Renovations', website: 'https://barrhavenreno.test', planId: 'grow', status: 'live', isTest: false, ageDays: 57 },
  { id: 'cl_waterdown_d', businessName: 'Waterdown Driving School', contactName: 'Grace Liu', email: 'grace@waterdowndriving.test', phone: '+19055550116', city: 'Waterdown', industry: 'Driving school', website: 'https://waterdowndriving.test', planId: null, status: 'lead', isTest: false, ageDays: 4 },
  { id: 'cl_nepeanortho', businessName: 'Nepean Orthodontics', contactName: 'Dr. Raj Mehta', email: 'raj@nepeanortho.test', phone: '+16135550152', city: 'Nepean', industry: 'Orthodontics', website: 'https://nepeanortho.test', planId: 'lets-talk', status: 'onboarding', isTest: false, ageDays: 14 },
  { id: 'cl_testco_0001', businessName: 'Sandbox Bakery (test)', contactName: 'Test Buyer', email: 'buyer+sandbox@tekmadev.test', phone: '+19055550000', city: 'Hamilton', industry: 'Bakery', website: 'https://sandboxbakery.test', planId: 'webline', status: 'pending', isTest: true, ageDays: 3 },
];

export const seedClient = (id: string) => SEED_CLIENTS.find((c) => c.id === id);

/** Staff strategists (client-facing account owners); emails only, as the API sends them. */
export const STRATEGISTS = ['owner@tekmadev.test', 'manager@tekmadev.test'] as const;

/** Fictional people for leads, subscribers and calls. */
export const SEED_PEOPLE = [
  { name: 'Olivia Martin', email: 'olivia.martin@mailbox.test', phone: '+19055550201' },
  { name: 'Noah Singh', email: 'noah.singh@mailbox.test', phone: '+16135550202' },
  { name: 'Chloe Roy', email: 'chloe.roy@mailbox.test', phone: '+19055550203' },
  { name: 'Liam Wilson', email: 'liam.w@mailbox.test', phone: '+16135550204' },
  { name: 'Emma Gauthier', email: 'emma.gauthier@mailbox.test', phone: '+19055550205' },
  { name: 'Ethan Brown', email: 'ethan.brown@mailbox.test', phone: '+16135550206' },
  { name: 'Ava Nguyen', email: 'ava.nguyen@mailbox.test', phone: '+19055550207' },
  { name: 'Lucas Fortin', email: 'lucas.fortin@mailbox.test', phone: '+16135550208' },
  { name: 'Mia Campbell', email: 'mia.c@mailbox.test', phone: '+19055550209' },
  { name: 'Benjamin Cote', email: 'ben.cote@mailbox.test', phone: '+16135550210' },
  { name: 'Zoe Ahmed', email: 'zoe.ahmed@mailbox.test', phone: '+19055550211' },
  { name: 'Jacob Pelletier', email: 'jacob.p@mailbox.test', phone: '+16135550212' },
  { name: 'Isla Thompson', email: 'isla.t@mailbox.test', phone: '+19055550213' },
  { name: 'William Leblanc', email: 'will.leblanc@mailbox.test', phone: '+16135550214' },
  { name: 'Sophie Anderson', email: 'sophie.a@mailbox.test', phone: '+19055550215' },
  { name: 'Owen Bouchard', email: 'owen.b@mailbox.test', phone: '+16135550216' },
  { name: 'Hannah Mitchell', email: 'hannah.m@mailbox.test', phone: '+19055550217' },
  { name: 'Felix Girard', email: 'felix.g@mailbox.test', phone: '+16135550218' },
  { name: 'Layla Hassan', email: 'layla.h@mailbox.test', phone: '+19055550219' },
  { name: 'Nathan Ross', email: 'nathan.r@mailbox.test', phone: '+16135550220' },
] as const;
