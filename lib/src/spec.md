This is the overall structure of different packages involved in our design

>> package: security-rules (data)
/security/rules.md
> no config, only files in package

>> package: devops-rules (data)
/devops/rules.md
> no config, only files in package

>> package: myorg-kit (producer)
/myorg/welcome.md
> config in package.json, indicates sets, sources, selector, output, presets definition
> sets:
   - package: myorg-kit; files: myorg/**; presets: basic,extended
   - package: devops-rules; files: devops/**; presets: basic,exteded
   - package: security-rules; files: security/**; presets: extended

>> npmdata cli (consumer)
> config .npmdatarc (with cosmiconfig) with extract list, each indicating source, selector, output. this is not a data package, only an extractor and can override some instructions from the source while writing the file to disk (such as gitignore option, unmanaged, force etc)
> extract:
  - package: myorg-kit; files: **/*.md; force: true

So, npmdata cli ----> myorg-kit ---> devops-rules
                               `--> security-rules

Flow:
- The cli is invoked with action "extract"
- It tries to find npmdata config in .npmdatarc in current dir where it was executed. 
- If found, get runner parameters from the file, if not, get from process arguments 
- (runner.ts opens package.json configuration that has sets definitions to be extracted and invoke one cli.ts instance per entry in the set. cli.ts runs a single extraction, it doesnt look for configuration files, not sets, as it's the basic operation for extracting files - selected in the selector config - from a package)
- if cli.ts was invoked and found a configuration with sets of files, it has to then invoke the runner.ts process to deal with the 
- Run the runner on the package:
    - open the source package contents and try to find a config file inside it
      - if not found, all files from this package are selected
      - if found, select the sets that will be extracted based on the "presets" configuration in cli
    - the cli config/args should "merge" with the instructions in the set of the package, so the runner that will unpack the package (producer) should read the configurations of the cli set/args, and also the configuration of the source packages for each set so that it can use it to generate the effective selectors and output for each set as follows:
        - output path should be concatenated, not overriden
        - file selector and content regex match should be a "AND"
        - other output config should be overriden by cli options
        - symlinks and contentReplacements should be appended

If not found, try to find command line args for the extraction and extract files according to args. 

If both config file and command line arguments related to extract are found, show an error (with the exception of dryRun, silent etc)

Statements:
npx npmdata --packages myorg-kit
   has the same effect as
npx myorg-kit
   has the same effect as
npx npmdata (with config file with a set with package: myorg-kit)

npx npmdata --packages myorg-kit --presets basic
   has the same effect as
npx myorg-kit --presets basic

Using the packages above as example, 
Running "npx npmdata --packages myorg-kit --presets basic" outputs
  - /myorg/welcome.md
  - /devops/rules.md
Running "npx npmdata --packages myorg-kit --files "!myorg/**" --presets extended" outputs
  - /devops/rules.md
  - /security/rules.md
