// Hand-written replacement for the Laravel-generated `@/wayfinder/types`.
// Provides the `App.Models.*` domain shapes and `Inertia.Pages.*` page-prop
// shapes the copied CRM pages reference. Only the CRM slice is covered.

export namespace App {
  export namespace Models {
    export type Organization = {
      id: number;
      name: string;
      contacts_count?: number;
      created_at: string | null;
    };

    export type Contact = {
      id: number;
      first_name: string;
      last_name: string;
      email: string | null;
      phone: string | null;
      is_favorite: boolean;
      organization?: Pick<Organization, "id" | "name"> | null;
      created_at: string | null;
    };

    export type User = {
      id: number;
      name: string;
      email: string;
    };

    export type Note = {
      id: number;
      body: string;
      contact?: Contact | null;
      user?: User | null;
      created_at: string | null;
    };
  }
}

export namespace Inertia {
  export namespace Pages {
    export namespace Crm {
      export type Dashboard = {
        totalContacts: number;
        totalOrganizations: number;
        recentNotesCount: number;
        recentActivity: App.Models.Note[];
      };
    }

    export namespace Contacts {
      export type Index = {
        contacts: unknown;
        filters: { search: string; favorite: boolean };
      };

      export type Show = {
        contact: App.Models.Contact;
        notes: App.Models.Note[];
      };

      export type Create = {
        organizations: App.Models.Organization[];
      };

      export type Edit = {
        contact: App.Models.Contact;
        organizations: App.Models.Organization[];
      };
    }

    export namespace Organizations {
      export type Index = {
        organizations: unknown;
        filters: { search: string };
      };

      export type Show = {
        organization: App.Models.Organization;
        contacts: unknown;
      };
    }
  }
}
