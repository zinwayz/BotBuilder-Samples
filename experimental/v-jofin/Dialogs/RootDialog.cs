using System.Collections.Generic;
using System.IO;
using Microsoft.Bot.Builder.Dialogs;
using Microsoft.Bot.Builder.Dialogs.Adaptive;
using Microsoft.Bot.Builder.Dialogs.Adaptive.Actions;
using Microsoft.Bot.Builder.Dialogs.Adaptive.Conditions;
using Microsoft.Bot.Builder.Dialogs.Adaptive.Generators;
using Microsoft.Bot.Builder.Dialogs.Adaptive.Input;
using Microsoft.Bot.Builder.Dialogs.Adaptive.Templates;
using Microsoft.Bot.Builder.LanguageGeneration;
using Microsoft.Extensions.Configuration;

namespace AdaptiveOAuthBot.Dialogs
{
    public class RootDialog : AdaptiveDialog
    {
        private const string OAUTH_PROMPT = "MSGraph-OAuth-prompt";

        public RootDialog(IConfiguration configuration, string dialogId = "RootDialog") : base(dialogId)
        {
            // Using the turn scope for this property, as the token is ephemeral.
            // If we need a copy of the token at any point, we should use this prompt to get the current token.
            // Only leave the prompt up for 1 minute. (Is there a way to not reprompt if this times-out?)
            var oauthInput = new OAuthInput
            {
                Id = OAUTH_PROMPT,
                ConnectionName = configuration["ConnectionName"],
                Title = "Please log in",
                Text = "This will give you access!",
                InvalidPrompt = new ActivityTemplate("Login was not successful please try again."),
                Timeout = 1000 * 60,
                MaxTurnCount = 3,
                Property = "turn.oauth",
            };
            Dialogs.Add(oauthInput);

            var fullPath = Path.Combine(".", "Dialogs", $"RootDialog.lg");
            Generator = new TemplateEngineLanguageGenerator(Templates.ParseFile(fullPath));

            // These steps are executed when this Adaptive Dialog begins
            Triggers = new List<OnCondition>
                {
                    // Add a rule to welcome the user.
                    new OnConversationUpdateActivity
                    {
                        Actions = WelcomeUserSteps(),
                    },

                    // Allow the use to sign out.
                    new OnIntent("logout")
                    {
                        Actions =
                        {
                            new CodeAction(async (dc, opt) =>
                            {
                                await oauthInput.SignOutUserAsync(dc);
                                return new DialogTurnResult(DialogTurnStatus.Complete);
                            }),
                        }
                    },

                    // Respond to user on message activity.
                    new OnUnknownIntent
                    {
                        Actions =
                        {
                            new BeginDialog(OAUTH_PROMPT),
                            new IfCondition
                            {
                                Condition = "turn.oauth.token && length(turn.oauth.token) > 0",
                                Actions = LoginSuccessSteps(),
                                ElseActions =
                                {
                                    new SendActivity("Sorry, we were unable to log you in."),
                                },
                            },
                            new EndDialog(),
                        }
                    },
                };
        }

        private static List<Dialog> WelcomeUserSteps() => new List<Dialog>
            {
                // Iterate through membersAdded list and greet user added to the conversation.
                new Foreach()
                {
                    ItemsProperty = "turn.activity.membersAdded",
                    Actions =
                    {
                        // Note: Some channels send two conversation update events - one for the Bot added to the conversation and another for user.
                        // Filter cases where the bot itself is the recipient of the message. 
                        new IfCondition()
                        {
                            Condition = "$foreach.value.name != turn.activity.recipient.name",
                            Actions =
                            {
                                new SendActivity("Hello, I'm the multi-turn prompt bot. Please send a message to get started!")
                            }
                        }
                    }
                }
            };

        private List<Dialog> LoginSuccessSteps() => new List<Dialog>
            {
                new SendActivity("You are now logged in."),
                new ConfirmInput
                {
                    Prompt = new ActivityTemplate("Would you like to view your token?"),
                    InvalidPrompt = new ActivityTemplate("Oops, I didn't understand. Would you like to view your token?"),
                    MaxTurnCount = 3,
                    Property = "turn.Confirmed",
                },
                new IfCondition
                {
                    Condition = "=turn.Confirmed",
                    Actions =
                    {
                        new BeginDialog(OAUTH_PROMPT),
                        new SendActivity("Here is your token `${turn.oauth.token}`."),
                    },
                    ElseActions =
                    {
                        new SendActivity("Great. Type anything to continue."),
                    },
                },
            };
    }
}
