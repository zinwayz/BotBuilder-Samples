# Snapshot Editor
The Snapshot Editor is a NodeJS browser-based UI that allows editing of Orchestrator snapshots.

The editor performs following features:
- Load existing `.blu` snapshot file.
- Interactively evaluate utterances against snapshot.
- View orchestrator results in a table view.
- Edit example text from snapshot.
- Change intent labels for existing examples.
- Add new examples.
- Delete examples.
- Save`.blu` file changes.



## Prerequisites

This sample **requires** prerequisites in order to run.

- (Windows) Install latest supported version of [Visual C++ Redistributable](https://support.microsoft.com/en-gb/help/2977003/the-latest-supported-visual-c-downloads) 
- (Mac) Install latest IC

- [Node.js](https://nodejs.org) version 10.14 or higher

  ```bash
  > node --version
  ```

## To try this bot sample
- Clone the repository
    ```bash
    > git clone https://github.com/microsoft/botbuilder-samples.git
    ```
    
- CD experimental/orchestrator/snapshot_editor
    ```bash
    > cd experimental/orchestrator/snapshot_editor
    ```

- Install package dependencies
   ```
   > npm install .
   ```

- Run the backend
   ```
   > node server.js
   ```
- Connect to UI
In web browser navigate to:
   `http://localhost:3000`

## Wish List

- LU file support
   - Load/save to/from LU format.
- Automatic download of model.
   -  The base model version ID is stored in the snapshot, it should be able to automatically download.
- App Insights integration
   - Download and visualize data from bot user traffic to ease intent classification.
- Compare models
   - Visualize results from multiple base models side by side.



## Further reading
- [Bot Framework Documentation](https://docs.botframework.com)
- [BF Orchestrator Command Usage](https://github.com/microsoft/botframework-sdk/blob/main/Orchestrator/docs/BFOrchestratorUsage.md)
- [Bot Basics](https://docs.microsoft.com/azure/bot-service/bot-builder-basics?view=azure-bot-service-4.0)
- [Activity processing](https://docs.microsoft.com/en-us/azure/bot-service/bot-builder-concept-activity-processing?view=azure-bot-service-4.0)
- [Azure Bot Service Introduction](https://docs.microsoft.com/azure/bot-service/bot-service-overview-introduction?view=azure-bot-service-4.0)
- [Azure Bot Service Documentation](https://docs.microsoft.com/azure/bot-service/?view=azure-bot-service-4.0)
- [.NET Core CLI tools](https://docs.microsoft.com/en-us/dotnet/core/tools/?tabs=netcore2x)
- [Azure CLI](https://docs.microsoft.com/cli/azure/?view=azure-cli-latest)
- [Azure Portal](https://portal.azure.com)
- [Channels and Bot Connector Service](https://docs.microsoft.com/en-us/azure/bot-service/bot-concepts?view=azure-bot-service-4.0)

