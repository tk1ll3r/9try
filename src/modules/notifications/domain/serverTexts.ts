import { language } from "../../../kernel/i18n";
import { localize } from "../../../../supabase/functions/_shared/notificationTexts";

/**
 * A notification's title or text in the reader's language. The database writes notifications in
 * Vietnamese; the table of what it writes, with the English, is shared with the push worker
 * (supabase/functions/_shared/notificationTexts.ts). What a person wrote, such as the name of a
 * meetup, stays as it is.
 */
export const shownText = (text: string): string => localize(text, language);
