/*

   template/service.template.ts
   service.ts template for developers

*/

import { status } from "elysia";
import type { ExampleModel } from "./model";

// service

export abstract class ExampleService {
    static async Login({ Username, Password }: any/* ExampleModel["Body"] */): Promise<any>/*Promise<ExampleModel["Response"]>*/ {
        // something
    }
}

// end
