// Import the official Notion SDK: https://github.com/makenotion/notion-sdk-js
import { Client } from "@notionhq/client";

// Import async-retry, which is used to retry requests if they fail: https://github.com/vercel/async-retry
import retry from "async-retry";

export default defineComponent({
  props: {
    notion: {
      type: "app",
      app: "notion",
    },
    databaseID: {
      type: "string",
      label: "Books Database",
      description: "Set you Books database.",
      async options({ query, prevContext }) {
        const notion = new Client({
          auth: this.notion.$auth.oauth_access_token,
        });

        let start_cursor = prevContext?.cursor;

        const response = await notion.search({
          ...(query ? { query } : {}),
          ...(start_cursor ? { start_cursor } : {}),
          page_size: 50,
          filter: {
            value: "database",
            property: "object",
          },
          sorts: [
            {
              direction: "descending",
              property: "last_edited_time",
            },
          ],
        });

        const options = response.results.map((db) => ({
          label: db.title?.[0]?.plain_text,
          value: db.id,
        }));

        return {
          context: {
            cursor: response.next_cursor,
          },
          options,
        };
      },
      reloadProps: true,
    },
    book_info: {
      type: "string",
      label: "Book Information",
      description: "Select the book information object from the previous step.",
    },
  },
  async additionalProps() {
    if (!this.databaseID) {
      return {};
    }

    const notion = new Client({
      auth: this.notion.$auth.oauth_access_token,
    });

    const database = await notion.databases.retrieve({
      database_id: this.databaseID,
    });

    const allowedTypes = ["title", "number", "rich_text", "files"];

    const properties = database.properties;

    const allowedProperties = Object.keys(properties).filter((key) =>
      allowedTypes.includes(properties[key].type)
    );

    return {
      title: {
        type: "string",
        label: "Book Title",
        description: "The title of the book.",
        optional: false,
        options: allowedProperties.map((prop) => ({
          label: prop,
          value: prop,
        })),
      },
      author: {
        type: "string",
        label: "Author",
        description: "The author of the book.",
        optional: true,
        options: allowedProperties.map((prop) => ({
          label: prop,
          value: prop,
        })),
      },
      publish_year: {
        type: "string",
        label: "Publish Year",
        description: "The publish year of the book.",
        optional: true,
        options: allowedProperties.map((prop) => ({
          label: prop,
          value: prop,
        })),
      },
      page_count: {
        type: "string",
        label: "Page Count",
        description: "The page count of the book.",
        optional: true,
        options: allowedProperties.map((prop) => ({
          label: prop,
          value: prop,
        })),
      },
      isbn_13: {
        type: "string",
        label: "ISBN-13 Number",
        description: "The ISBN-13 number of the book.",
        optional: true,
        options: allowedProperties.map((prop) => ({
          label: prop,
          value: prop,
        })),
      },
      cover_image: {
        type: "string",
        label: "Book Cover Image",
        description: "The file path to the book's cover image. You can select a Files & Media property here if you want to fill it with the book's cover image URL, which will also be set as the page's cover image.",
        optional: true,
        options: allowedProperties.map((prop) => ({
          label: prop,
          value: prop,
        })),
      },
    };
  },
  methods: {
    /**
     *  Creates a new Notion page using the constructed data object
     * */
    async createNotionPage(data) {
      // Create a new Notion client
      const notion = new Client({
        auth: this.notion.$auth.oauth_access_token,
      });

      // Log the data object for debugging
      console.log(`Data object for the new Notion page:`);
      console.dir(data);

      // Build a request that will retry upon failure
      try {
        return await retry(
          async (bail, attempt) => {
            try {
              console.log(`Creating new page in Notion (Attempt ${attempt})`);
              const response = await notion.pages.create(data);
              return response
            } catch (error) {
              if (error.status >= 400 && error.status < 409) {
                bail(
                  new Error(
                    `Cannot retry due to error: ${error.message} (Status code: ${error.status})`
                  )
                );
              } else {
                console.error(
                  `Retrying due to error: ${error.message} (Status code: ${error.status})`
                );
              }
            }
          },
          {
            retries: 3,
          }
        );
      } catch (error) {
        throw new Error(
          `Failed to create the new page in Notion due to error: ${error.message}`
        );
      }
    },
  },
  async run({ steps, $ }) {
    // Set an easily-referenced variable for the book object
    const book = this.book_info;

    // Construct the new page object. Conditionally add properties if they are set by user AND have a value in the book object to set.
    const data = {
      parent: {
        database_id: this.databaseID,
      },
      // We'll use short-circuit evaluation to conditionally add the cover and optional properties.
      ...(book.cover_image && {
        cover: {
          external: {
            url: book.cover_image,
          },
        },
      }),
      properties: {
        [this.title]: {
          title: [
            {
              text: {
                content: book.title,
              },
            },
          ],
        },
        ...(this.author &&
          book.author && {
            [this.author]: {
              rich_text: [
                {
                  text: {
                    content: book.author,
                  },
                },
              ],
            },
          }),
        ...(this.publish_year &&
          book.publish_year && {
            [this.publish_year]: {
              number: book.publish_year,
            },
          }),
        ...(this.page_count &&
          book.page_count && {
            [this.page_count]: {
              number: book.page_count,
            },
          }),
        ...(this.isbn_13 &&
          book.isbn_13 && {
            [this.isbn_13]: {
              number: book.isbn_13,
            },
          }),
        ...(this.cover_image && book.cover_image && {
          [this.cover_image]: {
            files: [
              {
                name: "Cover Image",
                external: {
                  url: book.cover_image,
                }
              }
            ]
          }
        })
      },
    };

    // Add the new page to the database
    const response = await this.createNotionPage(data);

    // Return the response from Notion
    return response;
  },
});