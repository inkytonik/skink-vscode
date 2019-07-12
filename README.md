# Skink Program Verification Tool

Visual Studio Code Language Server support for the Skink program verification tool.

Anthony M. Sloane

Programming Languages and Verification Research Group,
Department of Computing,
Macquarie University

## Prerequisites

If you have a Skink development directory building correctly then you should be able to use the extension.
See Setup below for configuration.

In detail, you will need:

* Java

* Skink "all-in-one" jar. Can be built in Skink development directory with "sbt assembly".

* `fshell-w2t` violation witness checker. The one in the Skink development directory should work.

* `check-true-witness.sh` correctness witness checker. The one in the Skink development directory should work.

## Setup

Adjust Skink settings. At least the following will need to be setup the first time:

* `skink.java`: path to Java runtime

* `skink.jar`: path to the Skink "all-in-one" jar.

* `skink.fshellw2tPath`: path to directory containing the `fshell-w2t` violation witness checker. The `fshell-w2t` sub-directory of the Skink development directory should work.

* `skink.checkTrueWitnessPath`: path to directory containing the `check-true-witness.sh` correctness witness checker. The `scripts` sub-directory of the Skink development directory should work.

These other settings can be adjusted as desired:

* `skink.frontend`: the Skink frontend to use. Some features are designed to work with C program verification, so won't be available when another frontend is used.

* `skink.optLevel`: the C compiler optimisation level to use.

* `skink.numericMode`: the numeric mode to use during verification.

* `skink.solver`: the SMT solver to use.

## Features

The Skink language server starts automatically when you open a C file.
If you want to restart with a new version of Skink, use the 'Skink: Restart server' command.

When a C file is opened or saved, Skink will be run to verify that file.
Diagnostics will indicate the results of the verification.

By default, Skink will verify the `main` function.
Use the "Skink: Choose Function to be Verified" command to change to another function.
This choice will apply only to the current file and will persist between editor sessions.

The Skink sidebar provides access to a lot of information about the verification process.
Under the "Products" heading there will be one entry for each file that has been verified and is still open.
Browse under that entry to find detailed descriptions of the verification results, witness values, LLVM code and control flow graphs, and log files.

Some of the products shown in the Skink sidebar are linked back to the original C file.
E.g., clicking on an instruction in the "program LLVM" product will focus the C code from which that instruction came.
The "Skink: Focus Product Editors" can be used to focus in the other direction: select a location in the C file, run the command, and you should see selections on relevant product text.
