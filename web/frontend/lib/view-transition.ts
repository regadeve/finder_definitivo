type RouterLike = {
  push: (href: string) => void;
  replace: (href: string) => void;
  refresh: () => void;
};

type TransitionDocument = Document & {
  startViewTransition?: (callback: () => void | Promise<void>) => {
    finished: Promise<void>;
  };
};

export function navigateWithTransition(
  router: RouterLike,
  href: string,
  method: "push" | "replace" = "push"
) {
  window.dispatchEvent(new CustomEvent("app:navigation-start"));

  const doc = document as TransitionDocument;
  const navigate = () => {
    router[method](href);
    router.refresh();
  };

  if (typeof doc.startViewTransition === "function") {
    doc.startViewTransition(() => {
      navigate();
    });
    return;
  }

  navigate();
}
