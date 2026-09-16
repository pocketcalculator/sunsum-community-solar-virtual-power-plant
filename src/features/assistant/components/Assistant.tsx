"use client";

/**
 * Owns the public assistant launcher and its right-side conversation drawer.
 * All current behavior stays in the browser: files are named but never read or
 * uploaded, speech only fills the draft, and replies come from a local model.
 */

import Link from "next/link";
import {
  type ChangeEvent,
  type FormEvent,
  type KeyboardEvent,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  ChatIcon,
  CloseIcon,
  MicrophoneIcon,
  PaperclipIcon,
  SendIcon,
  TrashIcon,
} from "@/components/ui/icons";
import { getLocalAssistantReply } from "../model/responses";
import styles from "./Assistant.module.css";

export interface AssistantOption {
  readonly href: string;
  readonly label: string;
}

interface ConversationMessage {
  readonly id: string;
  readonly speaker: "assistant" | "user";
  readonly text: string;
}

interface SpeechRecognitionResult {
  readonly isFinal: boolean;
  readonly [alternativeIndex: number]: { readonly transcript: string };
}

interface SpeechResultEvent extends Event {
  readonly results: {
    readonly length: number;
    readonly [resultIndex: number]: SpeechRecognitionResult;
  };
}

interface SpeechErrorEvent extends Event {
  readonly error: string;
}

interface BrowserSpeechRecognition {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  maxAlternatives: number;
  onend: (() => void) | null;
  onerror: ((event: SpeechErrorEvent) => void) | null;
  onresult: ((event: SpeechResultEvent) => void) | null;
  start(): void;
  stop(): void;
}

type SpeechRecognitionConstructor = new () => BrowserSpeechRecognition;

type SpeechWindow = Window & {
  SpeechRecognition?: SpeechRecognitionConstructor;
  webkitSpeechRecognition?: SpeechRecognitionConstructor;
};

const INITIAL_MESSAGES: readonly ConversationMessage[] = [
  {
    id: "initial-greeting",
    speaker: "assistant",
    text: "Hi, what can I help you with?",
  },
];

interface AssistantProps {
  readonly options: readonly AssistantOption[];
}

export function Assistant({ options }: AssistantProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const launcherRef = useRef<HTMLButtonElement>(null);
  const messageInputRef = useRef<HTMLTextAreaElement>(null);
  const recognitionRef = useRef<BrowserSpeechRecognition | null>(null);
  const shouldListenRef = useRef(false);
  const speechBaseDraftRef = useRef("");
  const [isOpen, setIsOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [messages, setMessages] =
    useState<readonly ConversationMessage[]>(INITIAL_MESSAGES);
  const [selectedFileName, setSelectedFileName] = useState<string | null>(null);
  const [speechStatus, setSpeechStatus] = useState("");
  const [isListening, setIsListening] = useState(false);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (isOpen && !dialog.open) {
      if (typeof dialog.showModal === "function") dialog.showModal();
      else dialog.setAttribute("open", "");
    }

    if (!isOpen && dialog.open) {
      if (typeof dialog.close === "function") dialog.close();
      else dialog.removeAttribute("open");
      launcherRef.current?.focus();
    }
  }, [isOpen]);

  function closeAssistant() {
    shouldListenRef.current = false;
    recognitionRef.current?.stop();
    setIsListening(false);
    setSpeechStatus("");
    setIsOpen(false);
  }

  function sendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const message = draft.trim();
    if (!message) return;

    setMessages((current) => [
      ...current,
      { id: `user-${current.length}`, speaker: "user", text: message },
      {
        id: `assistant-${current.length + 1}`,
        speaker: "assistant",
        text: getLocalAssistantReply(message),
      },
    ]);
    setDraft("");
    if (messageInputRef.current) messageInputRef.current.style.height = "";
  }

  function resizeMessageInput(input: HTMLTextAreaElement) {
    input.style.height = "auto";
    input.style.height = `${Math.min(input.scrollHeight, 160)}px`;
    input.style.overflowY = input.scrollHeight > 160 ? "auto" : "hidden";
  }

  function handleMessageKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (
      event.key === "Enter" &&
      !event.shiftKey &&
      !event.nativeEvent.isComposing
    ) {
      event.preventDefault();
      event.currentTarget.form?.requestSubmit();
    }
  }

  function selectFile(event: ChangeEvent<HTMLInputElement>) {
    setSelectedFileName(event.target.files?.[0]?.name ?? null);
  }

  function removeSelectedFile() {
    setSelectedFileName(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function toggleSpeechRecognition() {
    if (isListening) {
      shouldListenRef.current = false;
      recognitionRef.current?.stop();
      setIsListening(false);
      setSpeechStatus("Speech-to-text stopped.");
      return;
    }

    const speechWindow = window as SpeechWindow;
    const Recognition =
      speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition;

    if (!Recognition) {
      setSpeechStatus("Speech-to-text is not supported by this browser.");
      return;
    }

    const recognition = new Recognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";
    recognition.maxAlternatives = 1;
    recognition.onresult = (event) => {
      let transcript = "";
      let hasFinalResult = false;

      for (let index = 0; index < event.results.length; index += 1) {
        const result = event.results[index];
        transcript += result?.[0]?.transcript ?? "";
        hasFinalResult ||= result?.isFinal ?? false;
      }

      transcript = transcript.trim();
      if (transcript) {
        const baseDraft = speechBaseDraftRef.current.trimEnd();
        setDraft(baseDraft ? `${baseDraft} ${transcript}` : transcript);
        setSpeechStatus(
          hasFinalResult
            ? "Speech added. Keep speaking or press the microphone to stop."
            : "Listening…",
        );
        requestAnimationFrame(() => {
          if (messageInputRef.current) resizeMessageInput(messageInputRef.current);
        });
      }
    };
    recognition.onerror = (event) => {
      if (event.error === "no-speech") {
        setSpeechStatus("Still listening. Try speaking a little closer to the microphone.");
        return;
      }

      shouldListenRef.current = false;
      setIsListening(false);
      setSpeechStatus(
        event.error === "not-allowed" || event.error === "service-not-allowed"
          ? "Microphone access was not allowed. Check this site's browser permissions."
          : "Speech-to-text stopped. You can type your message instead.",
      );
    };
    recognition.onend = () => {
      if (shouldListenRef.current) {
        try {
          recognition.start();
          setSpeechStatus("Listening…");
          return;
        } catch {
          shouldListenRef.current = false;
          setSpeechStatus("Speech-to-text stopped. Press the microphone to try again.");
        }
      }

      recognitionRef.current = null;
      setIsListening(false);
    };

    recognitionRef.current = recognition;
    shouldListenRef.current = true;
    speechBaseDraftRef.current = draft;
    setIsListening(true);
    setSpeechStatus("Listening…");
    try {
      recognition.start();
    } catch {
      shouldListenRef.current = false;
      recognitionRef.current = null;
      setIsListening(false);
      setSpeechStatus("Speech-to-text could not start. Press the microphone to try again.");
    }
  }

  return (
    <>
      <button
        className={styles.launcher}
        onClick={() => setIsOpen(true)}
        ref={launcherRef}
        type="button"
      >
        <ChatIcon />
        <span>AI assistant</span>
      </button>

      <dialog
        aria-labelledby="assistant-title"
        className={styles.drawer}
        onCancel={(event) => {
          event.preventDefault();
          closeAssistant();
        }}
        ref={dialogRef}
      >
        <div className={styles.panel}>
          <header className={styles.panelHeader}>
            <div>
              <p className={styles.eyebrow}>Sunsum guide</p>
              <h2 className={styles.title} id="assistant-title">
                Community solar assistant
              </h2>
            </div>
            <button
              aria-label="Close assistant"
              className={styles.iconButton}
              onClick={closeAssistant}
              title="Close assistant"
              type="button"
            >
              <CloseIcon />
            </button>
          </header>

          <div
            aria-label="Conversation"
            aria-live="polite"
            className={styles.conversation}
            role="log"
          >
            {messages.map((message) => (
              <p
                className={
                  message.speaker === "assistant"
                    ? styles.assistantMessage
                    : styles.userMessage
                }
                key={message.id}
              >
                {message.text}
              </p>
            ))}

            <div className={styles.options} aria-label="Ways to take part">
              {options.map((option) => (
                <Link
                  className={styles.option}
                  href={option.href}
                  key={option.href}
                  onClick={closeAssistant}
                >
                  {option.label}
                </Link>
              ))}
            </div>
          </div>

          <form className={styles.composer} onSubmit={sendMessage}>
            {selectedFileName ? (
              <div className={styles.selectedFile}>
                <span title={selectedFileName}>{selectedFileName}</span>
                <button
                  aria-label={`Remove ${selectedFileName}`}
                  className={styles.removeFile}
                  onClick={removeSelectedFile}
                  title="Remove selected file"
                  type="button"
                >
                  <TrashIcon />
                </button>
              </div>
            ) : null}

            <label className={styles.inputLabel} htmlFor="assistant-message">
              Message
            </label>
            <textarea
              className={styles.messageInput}
              id="assistant-message"
              onChange={(event) => {
                setDraft(event.target.value);
                resizeMessageInput(event.target);
              }}
              onKeyDown={handleMessageKeyDown}
              placeholder="Ask about taking part"
              ref={messageInputRef}
              rows={3}
              value={draft}
            />
            <div className={styles.controlsRow}>
              <input
                className={styles.fileInput}
                onChange={selectFile}
                ref={fileInputRef}
                tabIndex={-1}
                type="file"
              />
              <button
                aria-label="Choose a file"
                className={`${styles.iconButton} ${styles.composerButton}`}
                onClick={() => fileInputRef.current?.click()}
                title="Choose a file"
                type="button"
              >
                <PaperclipIcon />
              </button>
              <button
                aria-label={isListening ? "Stop listening" : "Start speech-to-text"}
                aria-pressed={isListening}
                className={`${styles.iconButton} ${styles.composerButton}`}
                onClick={toggleSpeechRecognition}
                title={isListening ? "Stop listening" : "Start speech-to-text"}
                type="button"
              >
                <MicrophoneIcon />
              </button>
              <button
                aria-label="Send message"
                className={`${styles.sendButton} ${styles.composerButton}`}
                disabled={!draft.trim()}
                title="Send message"
                type="submit"
              >
                <SendIcon />
              </button>
            </div>
            <p className={styles.privacyNote}>
              Preview only. Selected files stay on this device and are not uploaded.
            </p>
            <p className={styles.speechStatus} role="status">
              {speechStatus}
            </p>
          </form>
        </div>
      </dialog>
    </>
  );
}