// In-memory CRM data layer — a stand-in for the Laravel/Eloquent backend of
// the original demo. Plain TS objects plus list/find/create/update/delete
// helpers; no real database. Seeded deterministically on module load.

export type User = {
  id: number;
  name: string;
  email: string;
};

export type Organization = {
  id: number;
  name: string;
  created_at: string;
};

export type Contact = {
  id: number;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  organization_id: number | null;
  is_favorite: boolean;
  created_at: string;
};

export type Note = {
  id: number;
  body: string;
  contact_id: number;
  user_id: number;
  created_at: string;
};

const FIRST_NAMES = [
  "Alice", "Bob", "Carol", "David", "Eva", "Frank", "Grace", "Henry",
  "Ivy", "Jack", "Karen", "Liam", "Mia", "Noah", "Olivia", "Paul",
  "Quinn", "Rosa", "Sam", "Tina", "Uma", "Victor", "Wendy", "Xavier",
  "Yara", "Zane",
];
const LAST_NAMES = [
  "Anderson", "Brown", "Clark", "Davis", "Evans", "Foster", "Garcia",
  "Harris", "Irwin", "Jones", "King", "Lewis", "Moore", "Nelson",
  "Owens", "Patel", "Reed", "Scott", "Turner", "Underwood", "Vargas",
  "Walker", "Young", "Zimmer",
];
const COMPANY_WORDS = [
  "Acme", "Globex", "Initech", "Umbrella", "Soylent", "Hooli", "Stark",
  "Wayne", "Wonka", "Cyberdyne", "Tyrell", "Pied Piper", "Vehement",
  "Massive Dynamic", "Vandelay",
];
const NOTE_BODIES = [
  "Followed up on the proposal — awaiting their decision.",
  "Left a voicemail about the renewal terms.",
  "Great call today; they want a demo next week.",
  "Sent the updated pricing sheet via email.",
  "Discussed onboarding timeline; targeting next month.",
  "Flagged a billing question for the finance team.",
  "Confirmed the contract details and next steps.",
  "Met at the conference; promising lead.",
];

/** Deterministic pseudo-random generator so seed data is stable across runs. */
function makeRng(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 0xffffffff;
    return state / 0xffffffff;
  };
}

function pick<T>(rng: () => number, arr: T[]): T {
  return arr[Math.floor(rng() * arr.length)];
}

const rng = makeRng(42);

export const users: User[] = [
  { id: 1, name: "Test User", email: "test@example.com" },
  { id: 2, name: "Jordan Avery", email: "jordan@example.com" },
  { id: 3, name: "Morgan Lee", email: "morgan@example.com" },
  { id: 4, name: "Riley Quinn", email: "riley@example.com" },
];

export const organizations: Organization[] = COMPANY_WORDS.map((word, i) => ({
  id: i + 1,
  name: `${word} ${pick(rng, ["Inc", "LLC", "Group", "Corp", "Co"])}`,
  created_at: new Date(Date.now() - (i + 1) * 86_400_000).toISOString(),
}));

export const contacts: Contact[] = [];
for (let i = 1; i <= 100; i += 1) {
  const first = pick(rng, FIRST_NAMES);
  const last = pick(rng, LAST_NAMES);
  // First 75 belong to an organization; the rest have none.
  const hasOrg = i <= 75;
  contacts.push({
    id: i,
    first_name: first,
    last_name: last,
    email: `${first.toLowerCase()}.${last.toLowerCase()}${i}@example.com`,
    phone: `+1 (555) ${String(100 + (i % 900)).padStart(3, "0")}-${String(
      1000 + i,
    ).slice(-4)}`,
    organization_id: hasOrg
      ? organizations[Math.floor(rng() * organizations.length)].id
      : null,
    is_favorite: rng() < 0.2,
    created_at: new Date(Date.now() - i * 3_600_000).toISOString(),
  });
}

export const notes: Note[] = [];
{
  let noteId = 1;
  const noted = [...contacts].sort(() => rng() - 0.5).slice(0, 40);
  for (const contact of noted) {
    const count = 1 + Math.floor(rng() * 5);
    for (let n = 0; n < count; n += 1) {
      notes.push({
        id: noteId,
        body: pick(rng, NOTE_BODIES),
        contact_id: contact.id,
        user_id: pick(rng, users).id,
        created_at: new Date(
          Date.now() - noteId * 1_800_000,
        ).toISOString(),
      });
      noteId += 1;
    }
  }
}

let nextContactId = contacts.length + 1;
let nextNoteId = notes.length + 1;

/** The fake authenticated user shared with every page (Phase 1 auth stub). */
export const currentUser: User = users[0];

/** Returns the organization for a contact, or null. */
export function organizationFor(contact: Contact): Organization | null {
  if (contact.organization_id == null) {
    return null;
  }
  return organizations.find((o) => o.id === contact.organization_id) ?? null;
}

/** Number of contacts belonging to an organization. */
export function contactCountFor(organizationId: number): number {
  return contacts.filter((c) => c.organization_id === organizationId).length;
}

/** Finds a contact by id, or undefined. */
export function findContact(id: number): Contact | undefined {
  return contacts.find((c) => c.id === id);
}

/** Finds an organization by id, or undefined. */
export function findOrganization(id: number): Organization | undefined {
  return organizations.find((o) => o.id === id);
}

/** Creates a contact from raw form input and returns it. */
export function createContact(input: {
  first_name: string;
  last_name: string;
  email?: string | null;
  phone?: string | null;
  organization_id?: number | null;
}): Contact {
  const contact: Contact = {
    id: nextContactId,
    first_name: input.first_name,
    last_name: input.last_name,
    email: input.email || null,
    phone: input.phone || null,
    organization_id: input.organization_id ?? null,
    is_favorite: false,
    created_at: new Date().toISOString(),
  };
  nextContactId += 1;
  contacts.push(contact);
  return contact;
}

/** Applies a partial update to a contact in place. */
export function updateContact(
  contact: Contact,
  input: Partial<Omit<Contact, "id" | "created_at">>,
): Contact {
  Object.assign(contact, input);
  return contact;
}

/** Removes a contact and its notes. */
export function deleteContact(id: number): void {
  const index = contacts.findIndex((c) => c.id === id);
  if (index !== -1) {
    contacts.splice(index, 1);
  }
  for (let i = notes.length - 1; i >= 0; i -= 1) {
    if (notes[i].contact_id === id) {
      notes.splice(i, 1);
    }
  }
}

/** Creates a note attached to a contact and returns it. */
export function createNote(input: {
  contact_id: number;
  user_id: number;
  body: string;
}): Note {
  const note: Note = {
    id: nextNoteId,
    body: input.body,
    contact_id: input.contact_id,
    user_id: input.user_id,
    created_at: new Date().toISOString(),
  };
  nextNoteId += 1;
  notes.push(note);
  return note;
}

/** Notes for a contact, newest first. */
export function notesForContact(contactId: number): Note[] {
  return notes
    .filter((n) => n.contact_id === contactId)
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
}

/** Finds a user by id, or undefined. */
export function findUser(id: number): User | undefined {
  return users.find((u) => u.id === id);
}
