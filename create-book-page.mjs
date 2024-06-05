/* --- To Do

- [ ] Create Notion props
- [ ] Create Notion request method
- [ ] Create Book API request method
- [ ] Create cover image request method
- [ ] Create fallback handler method
- [ ] Create final book object constructor

-- */

/* --- Imports --- */

// Request clients
import axios from "axios"
import { Client } from "@notionhq/client"

// Error handling
import retry from "async-retry"

export default defineComponent({
    props: {
        notion: {
            type: "app",
            app: "notion"
        },
        databaseID: {
            type: "string",
            label: "Books Database",
            description: "Set you Books database.",
            async options({ query, prevContext }) {
                const notion = new Client ({
                    auth: this.notion.$auth.oauth_access_token
                })

                let start_cursor = prevContext?.cursor

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
                            property: "last_edited_time"
                        }
                    ]
                })

                const options = response.results.map((db) => ({
                    label: db.title?.[0]?.plain_text,
                    value: db.id
                }))

                return {
                    context: {
                        cursor: response.next_cursor
                    },
                    options,
                }
            },
            reloadProps: true,
        }
    },
    async additionalProps() {
        if (!this.databaseID) {
            return {}
        }

        const notion = new Client({
            auth: this.notion.$auth.oauth_access_token
        })

        const database = await notion.databases.retrieve({
            database_id: this.databaseID
        })

        const allowedTypes = ['title', 'number', 'rich_text']

        const properties = database.properties

        const allowedProperties = Object.keys(properties).filter(
            (key) => allowedTypes.includes(properties[key].type)
        )

        return {
            title: {
                type: "string",
                label: "Book Title",
                description: "The title of the book.",
                optional: false,
                options: allowedProperties.map((prop) => ({ label: prop, value: prop}))
            },
            author: {
                type: "string",
                label: "Author",
                description: "The author of the book.",
                optional: true,
                options: allowedProperties.map((prop) => ({ label: prop, value: prop}))
            },
            publish_year: {
                type: "string",
                label: "Publish Year",
                description: "The publish year of the book.",
                optional: true,
                options: allowedProperties.map((prop) => ({ label: prop, value: prop}))
            },
            page_count: {
                type: "string",
                label: "Page Count",
                description: "The page count of the book.",
                optional: true,
                options: allowedProperties.map((prop) => ({ label: prop, value: prop}))
            },
            isbn_13: {
                type: "string",
                label: "ISBN-13 Number",
                description: "The ISBN-13 number of the book.",
                optional: true,
                options: allowedProperties.map((prop) => ({ label: prop, value: prop}))
            },
        }
    },
    methods: {

    },
    async run({ steps, $}) {

    }
})