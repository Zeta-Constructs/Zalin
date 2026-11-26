/*

   template/model.template.ts
   model.ts template for developers

*/

import { t } from "elysia";

// types

type Infer<T> = T extends {
    static: infer S
} ? S : {
    [K in keyof T]: Infer<T[K]>
}

// model

export const /* append any name you put here with Model */ ExampleModel = {
    /* Body: t.Object({
        Username: t.String({
            minLength: 3,
            maxLength: 30
        }),

        Password: t.String({ minLength: 8 })
    }),

    Response: t.Object({
        Token: t.String() // improve on this
    }),

    Error: t.Object({
        Message: t.String()
    })
  */
}

export type ExampleModel = Infer<typeof ExampleModel>;

// end
