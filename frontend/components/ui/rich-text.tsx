"use client";

import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import LinkExt from "@tiptap/extension-link";
import { Bold, Italic, Link as LinkIcon, List, ListOrdered, Quote, Redo, Strikethrough, Undo } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export function RichTextEditor({
  value, onChange, placeholder,
}: { value: string; onChange: (html: string) => void; placeholder?: string }) {
  const editor = useEditor({
    extensions: [
      StarterKit,
      LinkExt.configure({ openOnClick: false, HTMLAttributes: { rel: "noopener noreferrer" } }),
    ],
    content: value || "",
    onUpdate: ({ editor }) => onChange(editor.getHTML()),
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class: "prose prose-sm max-w-none focus:outline-none min-h-[160px] px-3 py-2",
      },
    },
  });

  if (!editor) return null;

  function TBtn({
    onClick, active, children, label,
  }: { onClick: () => void; active?: boolean; children: React.ReactNode; label: string }) {
    return (
      <Button type="button" size="icon" variant={active ? "default" : "ghost"} title={label}
              onClick={onClick} className="h-8 w-8">
        {children}
      </Button>
    );
  }

  return (
    <div className="overflow-hidden rounded-md border">
      <div className="flex flex-wrap items-center gap-0.5 border-b bg-muted/30 px-1 py-1">
        <TBtn label="Grassetto" active={editor.isActive("bold")} onClick={() => editor.chain().focus().toggleBold().run()}>
          <Bold className="h-3.5 w-3.5" />
        </TBtn>
        <TBtn label="Corsivo" active={editor.isActive("italic")} onClick={() => editor.chain().focus().toggleItalic().run()}>
          <Italic className="h-3.5 w-3.5" />
        </TBtn>
        <TBtn label="Barrato" active={editor.isActive("strike")} onClick={() => editor.chain().focus().toggleStrike().run()}>
          <Strikethrough className="h-3.5 w-3.5" />
        </TBtn>
        <div className="mx-1 h-5 w-px bg-border" />
        <TBtn label="Elenco puntato" active={editor.isActive("bulletList")} onClick={() => editor.chain().focus().toggleBulletList().run()}>
          <List className="h-3.5 w-3.5" />
        </TBtn>
        <TBtn label="Elenco numerato" active={editor.isActive("orderedList")} onClick={() => editor.chain().focus().toggleOrderedList().run()}>
          <ListOrdered className="h-3.5 w-3.5" />
        </TBtn>
        <TBtn label="Citazione" active={editor.isActive("blockquote")} onClick={() => editor.chain().focus().toggleBlockquote().run()}>
          <Quote className="h-3.5 w-3.5" />
        </TBtn>
        <div className="mx-1 h-5 w-px bg-border" />
        <TBtn label="Link" active={editor.isActive("link")} onClick={() => {
          const prev = editor.getAttributes("link").href as string | undefined;
          const url = window.prompt("URL link", prev ?? "https://");
          if (url === null) return;
          if (!url) editor.chain().focus().unsetLink().run();
          else editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
        }}>
          <LinkIcon className="h-3.5 w-3.5" />
        </TBtn>
        <div className="mx-1 h-5 w-px bg-border" />
        <TBtn label="Annulla" onClick={() => editor.chain().focus().undo().run()}>
          <Undo className="h-3.5 w-3.5" />
        </TBtn>
        <TBtn label="Rifai" onClick={() => editor.chain().focus().redo().run()}>
          <Redo className="h-3.5 w-3.5" />
        </TBtn>
      </div>
      <EditorContent editor={editor} className={cn("bg-background")} placeholder={placeholder} />
    </div>
  );
}
