/** A note as returned by the backend `/api/notes` endpoint. */
export type Note = {
  id: number;
  title: string;
  content: string;
  createdAt: string;
  updatedAt: string;
};

/** The payload for creating a note. */
export type CreateNote = {
  title: string;
  content: string;
};
