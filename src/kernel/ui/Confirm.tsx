import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";
import { Button } from "./Button";
import { DialogPanel } from "./DialogPanel";
import { t } from "../i18n";

export interface Question {
  title: string;
  /** What will happen, in a sentence or two. */
  body: string;
  /** The words on the button that goes ahead: "Xóa", "Rời nhóm". */
  action: string;
  /** False for a step that takes nothing away, such as handing a group to someone else. */
  danger?: boolean;
}

const Ask = createContext<((question: Question) => Promise<boolean>) | null>(null);

/** Shows the questions asked through `useConfirm` in the app's own dialog. One per signed-in app. */
export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [question, setQuestion] = useState<Question | null>(null);
  const [open, setOpen] = useState(false);
  const answer = useRef<(yes: boolean) => void>(() => {});
  const ask = useCallback((next: Question) => new Promise<boolean>(resolve => {
    // A question that was still open counts as answered with no.
    answer.current(false);
    answer.current = resolve;
    setQuestion(next);
    setOpen(true);
  }), []);
  function close(yes: boolean) {
    setOpen(false);
    answer.current(yes);
    answer.current = () => {};
  }
  // The last question stays in the dialog while it closes, so its text does not vanish first.
  return <Ask.Provider value={ask}>
    {children}
    <DialogPanel alert open={open} onOpenChange={next => { if (!next) close(false); }} title={question?.title ?? ""} description={question?.body ?? ""}>
      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="ghost" data-dialog-initial-focus onClick={() => close(false)}>{t("Thôi")}</Button>
        <Button variant={question?.danger === false ? "primary" : "danger"} onClick={() => close(true)}>{question?.action}</Button>
      </div>
    </DialogPanel>
  </Ask.Provider>;
}

/**
 * Asks before a step that cannot be taken back. Resolves with true when the person goes ahead:
 * `if (await confirm({ title, body, action })) …`
 */
export function useConfirm(): (question: Question) => Promise<boolean> {
  const ask = useContext(Ask);
  if (!ask) throw new Error("useConfirm outside ConfirmProvider");
  return ask;
}
