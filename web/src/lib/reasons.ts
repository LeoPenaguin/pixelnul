// Report reasons, as the server knows them (board.Reasons), with their label.

export const REASONS: Record<string, string> = {
  hate: 'Haine ou discrimination',
  sexual: 'Contenu sexuel ou choquant',
  personal: 'Informations personnelles',
  other: 'Autre contenu',
  bug: 'Un bug sur le site',
}

/** Reasons that say nothing alone: a description is required. */
export const NEEDS_COMMENT = ['other', 'bug']
