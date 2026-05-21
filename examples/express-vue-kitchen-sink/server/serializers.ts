// Shapes the in-memory records into the prop structures the Vue pages expect —
// the Express equivalent of the demo's Laravel API Resources.

import {
  type Contact,
  contactCountFor,
  type Note,
  type Organization,
  organizationFor,
  type User,
  findContact,
  findUser,
} from "./data.js";

/** Serialized organization, optionally with a contact count. */
export type OrganizationJson = {
  id: number;
  name: string;
  contacts_count?: number;
  created_at: string;
};

/** Serialized contact, with its organization inlined when known. */
export type ContactJson = {
  id: number;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  organization: { id: number; name: string } | null;
  is_favorite: boolean;
  created_at: string;
};

/** Serialized note, with contact and user inlined. */
export type NoteJson = {
  id: number;
  body: string;
  contact: ContactJson | null;
  user: { id: number; name: string; email: string } | null;
  created_at: string;
};

/** Serializes an organization; pass `withCount` to include `contacts_count`. */
export function organizationJson(
  org: Organization,
  withCount = false,
): OrganizationJson {
  return {
    id: org.id,
    name: org.name,
    ...(withCount ? { contacts_count: contactCountFor(org.id) } : {}),
    created_at: org.created_at,
  };
}

/** Serializes a contact, inlining its organization. */
export function contactJson(contact: Contact): ContactJson {
  const org = organizationFor(contact);
  return {
    id: contact.id,
    first_name: contact.first_name,
    last_name: contact.last_name,
    email: contact.email,
    phone: contact.phone,
    organization: org ? { id: org.id, name: org.name } : null,
    is_favorite: contact.is_favorite,
    created_at: contact.created_at,
  };
}

/** Serializes a user for embedding in note payloads. */
export function userJson(user: User): {
  id: number;
  name: string;
  email: string;
} {
  return { id: user.id, name: user.name, email: user.email };
}

/** Serializes a note, inlining its contact and author. */
export function noteJson(note: Note): NoteJson {
  const contact = findContact(note.contact_id);
  const user = findUser(note.user_id);
  return {
    id: note.id,
    body: note.body,
    contact: contact ? contactJson(contact) : null,
    user: user ? userJson(user) : null,
    created_at: note.created_at,
  };
}
