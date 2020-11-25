// See LICENSE.md for copyright info


var selectors;
var selector_first_index;
var current_selector_node;
var selector_last_index;
var commentObserver = null;

//var processedListItems = {};
var commenteerLoadMoreCommentsButton = null;

var g_username;


/* insertMatchedComments can return a bunch of things:
  ** should return an array of LIs **
   1. Empty array: nothing interesting here
   2. An array of listitems -- everything is at the same level
   3. An array of arrays only -- return the contents of each array in a single array
   4. Mix of arrays and listitems: 
      for each array, create a li/ol and house the array contents under the ol

Invariant: returnedArray.every((node) => node.nodeName == "LI")
*/

function insertMatchedComments(commentListHead, username, inMatch) {
    // Returns an ol node with children, or possibly null

    // If we fail to get something, throw an exception and deal with the general error msg
    var listItems = commentListHead.childNodes;
    let listItemsToUse = [];
    listItems.forEach(function(li, listItemsIndex) {
        let commentID = li.id;
        if (!commentID) {
            console.log("stereogum-commenteer: skipping unexpected node "
                        + li.nodeName
                        + ": "
                        + li.outerHTML.substr(0, 40));
            return;
        }
        /*
          let alreadyProcessed = (commentID in processedListItems);
          if (!alreadyProcessed) {
          processedListItems[commentID] = true;
          }
        */
        let cc = li.querySelector("div.comment-content");
	let isRelevant = false;
        let newListItem = null;
        try {
            let ccNameAndText = cc.querySelector("div.comment-name-and-text");
            let ccMeta = ccNameAndText.querySelector("div.comment-meta");
            let ccName = ccMeta.querySelector("span.comment-author-username a").innerText;
            let ccInReplyTo = ccMeta.querySelector("span.reply-username").innerText;

            isRelevant = (ccName == username || ccInReplyTo == username);
            if (isRelevant || inMatch) { //  && !alreadyProcessed) {
                let ccOptions = cc.querySelector("div.comment-options div.comment-info-and-votes");
                let ccDate  = ccOptions.querySelector("span.date a").innerText;
                let ccScore = ccOptions.querySelector("span.comment-score span.total").innerText;
                let commentText = ccNameAndText.querySelector("div.comment-text p").innerText;
                if (commentText.length == 0) {
                    // Just get all of it
                    commentText = ccNameAndText.querySelector("div.comment-text").innerText;
                }
                let finalCommentText;
                if (commentText.length > 50) {
                    let test1 = commentText.replace(/^(.{45,55})\s.*/, "\1");
                    if (test1.length > 10 && test1.length < 45) {
                        finalCommentText = test1.trim();
                    } else {
                        finalCommentText = commentText.substr(0, 50).trim();
                    }
		    finalCommentText += "...";
                } else {
                    finalCommentText = commentText;
                }
                // avoid dumb XSS vulnerabilities in the a-element content
                //finalCommentText = finalCommentText.replace(/[<&]/g, "?");
                newListItem = document.createElement("li");
                newListItem.classList.add("commenteer-ref");
		
		let span1 = document.createElement("span");
		span1.classList.add("commenteer-link");
		span1.textContent = (ccName == username ? "you said" : (ccName + " replied")) + ": ";
		let a1 = document.createElement("a");
		a1.href = "#" + commentID;
		a1.textContent = finalCommentText;
		let span2 = document.createElement("span");
		span2.classList.add("commenteer-link");
		span2.textContent = " | " + ccDate;
		let span3 = document.createElement("span");
		span3.classList.add("commenteer-link");
		span3.textContent = " | " + ccScore;
		newListItem.appendChild(span1);
		newListItem.appendChild(a1);
		newListItem.appendChild(span2);
		newListItem.appendChild(span3);
            }
        } catch(ex) {
            if (li.nodeName == "BUTTON" && commentID == "load-more-comments") {
                console.log("QQQ: stereogum-commenteer: found the load-more-comments button");
		commenteerLoadMoreCommentsButton.classList.add("visible");
		commenteerLoadMoreCommentsButton.classList.remove("hidden");
            } else {
                console.log("stereogum-commenteer: skipping unexpected node "
                            + li.outerHTML.substr(0, 60));
            }
            return;
        }
        let children = li.childNodes[1];

        let hasChildren = (children
                           && children.nodeName == "UL"
                           && children.classList.contains("children")
                           && children.childElementCount > 0);
        if (hasChildren) {
            let innerRefList = insertMatchedComments(children, username, inMatch || isRelevant);
            if (innerRefList.length > 0) {
		if (newListItem === null) {
		    listItemsToUse = listItemsToUse.concat(innerRefList);
		} else {
		    listItemsToUse.push(newListItem);
		    let ol_wrapper = document.createElement("ol");
		    ol_wrapper.classList.add("commenteer-responses");
		    innerRefList.forEach(function(innerLI) { ol_wrapper.appendChild(innerLI) });
		    
		    let li_wrapper = document.createElement("li");
		    li_wrapper.classList.add("commenteer-ref");
		    li_wrapper.appendChild(ol_wrapper);
		    listItemsToUse.push(li_wrapper);
		}
            }
        } else if (newListItem) {
            listItemsToUse.push(newListItem);
	}
        
    });
    return listItemsToUse;
}

var reloadCommentsTimeoutID = null;
const reloadCommentsTimeoutWait = 1 * 1000;

function clearLoadingCommentsTimeout() {
    if (reloadCommentsTimeoutID) {
        clearTimeout(reloadCommentsTimeoutID);
        reloadCommentsTimeoutID = null;
    }
}

function reloadComments() {
    try {
	clearTimeout(reloadCommentsTimeoutID);
	reloadCommentsTimeoutID = null;
	let div2 = document.querySelector("div.commenteer-response-toc")
	let commentListHead = document.querySelector("ol.commentlist-ice.noavas");
	finishCreatingTOC(commentListHead, div2, g_username);
    } catch(ex) {
        console.log("QQQ: stereogum-commenteer: error in reloadComments: " + ex);
    }
}

function comments_loading_callback(mutations) {
    clearLoadingCommentsTimeout();
    reloadCommentsTimeoutID = setTimeout(reloadComments, reloadCommentsTimeoutWait);
}

function startObservingComments(commentListHead) {
    if (typeof(commentListHead) == "undefined") {
	commentListHead = document.querySelector("ol.commentlist-ice.noavas");
    }
    if (commentObserver != null) {
	commentObserver.disconnect();
    }
    commentObserver = new MutationObserver(comments_loading_callback);
    commentObserver.observe(commentListHead, {childList: true, subTree: true});
}

function handleLoadMoreComments(event) {
    try {
	console.log("QQQ: stereogum-commenteer: fired load-more click");
	commenteerLoadMoreCommentsButton.classList.add("hidden");
	commenteerLoadMoreCommentsButton.classList.remove("visible");
	let loadMoreButton = document.getElementById("load-more-comments");
	if (!loadMoreButton) {
	    console.log("stereogum-commenteer: load-more-button disappeared, can't load more comments");
	    return;
	}
	if (loadMoreButton) {
            loadMoreButton.click();
	    startObservingComments();
	} else {
            console.log("QQQ: stereogum-commenteer: no load-more-comments button to click");
	}
    } catch(ex) {
        console.log("QQQ: stereogum-commenteer: error in handleLoadMoreComments: " + ex);
    }
}

function finishCreatingTOC(commentListHead, div2, username) {

    while (div2.childElementCount > 0) {
        div2.removeChild(div2.firstChild);
    }
    let refs = insertMatchedComments(commentListHead, username, false);
    if (refs && refs.length > 0) {
        let ol = document.createElement("ol");
        ol.classList.add("commenteer-responses");
        refs.forEach(function(li) { return ol.appendChild(li)});
        div2.appendChild(ol);
    } else {
        let p = document.createElement("p");
        p.textContent = "No comments and replies for " + username + " yet";
        div2.appendChild(p);
    }
}

function createTOC(username) {
    let h4 = document.createElement("h3")
    h4.appendChild(document.createTextNode("Comments by and responses for " + username))

    commenteerLoadMoreCommentsButton = document.createElement("button");
    commenteerLoadMoreCommentsButton.classList.add("commenteer-load-more-comments");
    commenteerLoadMoreCommentsButton.classList.add("hidden");
    commenteerLoadMoreCommentsButton.textContent = "load more comments";
    commenteerLoadMoreCommentsButton.addEventListener("click", handleLoadMoreComments, false);
    
    //TODO: copy styles from load-more-comments button to commenteerLoadMoreCommentsButton
    // use a class to show/hide commenteerLoadMoreCommentsButton
    var srcButton, styleName, styleValue;
    if (!!(srcButton = document.getElementById("load-more-comments"))) {
	//commenteerLoadMoreCommentsButton.style.cssText = document.defaultView.getComputedStyle(srcButton, "").cssText
	commenteerLoadMoreCommentsButton.classList.add("hidden");
	commenteerLoadMoreCommentsButton.classList.remove("visible");
    }
    
    let div = document.createElement("div")
    div.classList.add("commenteer-response-toc-container");
    div.appendChild(h4);
    div.appendChild(commenteerLoadMoreCommentsButton);
    
    let div2 = document.createElement("div")
    div2.classList.add("commenteer-response-toc");
    div.appendChild(div2);

    let div3 = document.createElement("div");
    div3.classList.add("commenteer-response-footer");
    let p3 = document.createElement("p");
    p3.innerHTML = "Comment references block created by the stereogum-commenteer extension. See <a href=\"https://addons.mozilla.org/en-US/addon/stereogum-commenteer\" target=\"_blank\">the addon page</a> for more info."
    div3.appendChild(p3);
    div.appendChild(div3);

    let commentListHead = document.querySelector("ol.commentlist-ice.noavas");
    startObservingComments(commentListHead);
    finishCreatingTOC(commentListHead, div2, username);
    
    let parent = commentListHead.parentElement;
    parent.insertBefore(div, commentListHead);

    let loader = document.querySelector("div#loader");
    let footer = document.querySelector("div.footer-wrapper");
    if (loader && footer) {
	// This thing blinks annoyingly
	loader.parentElement.removeChild(loader);
	footer.parentElement.insertBefore(loader, footer);
    }
}

function setupTOC(elt) {
    if (!(elt.nodeName == "DIV" && elt.classList.contains("form-username"))) {
        console.log("stereogum-commenteer: expected to see form-username, got "
                    + elt.nodeName
                    + ":"
                    + elt.classList);
        return;
    }
    var childNodes = elt.childNodes;
    if (childNodes.length < 3) {
        console.log("stereogum-commenteer: didn't get 3 child nodes in " + elt.nodeName);
        return;
    }
    let m = elt.childNodes[1].outerHTML.match(/<b>(.*?)<\/b>/);
    if (!(elt.childNodes[0].textContent.trim() == "Logged in as"
          && m
          && elt.childNodes[2].textContent.trim() == ".")) {
        console.log("stereogum-commenteer: didn't get expected children for form-username, got "
                    + elt.innerHTML);
        return;
    }
    g_username = m[1];
    createTOC(g_username);
}

function lookForLowestNode() {
    var i;
    for (i = selector_last_index; i >= selector_first_index; i -= 1) {
        var node = current_selector_node.querySelector(selectors[i]);
        if (node) {
            if (commentObserver) {
                commentObserver.disconnect();
                commentObserver = null;
            }
            if (i == selector_last_index) {
		if (node.querySelector("p a.sign-in-link")) {
		    console.log("QQQ: stereogum-commenteer: not logged in");
		} else {
                    setupTOC(node);
		}
                return;
            } else {
                selector_first_index = i;
                current_selector_node = node;
                commentObserver = new MutationObserver(children_changed_callback);
                commentObserver.observe(node, {childList: true});
            }
            return;
        }
    }
}
                

function safeLookForLowestNode() {
    try {
        lookForLowestNode();
    } catch(ex) {
        console.log("stereogum-commenteer: error in lookForLowestNode: " + ex);
        console.table(ex);
    }
}

function children_changed_callback(mutations) {
    console.log("QQQ: stereogum-commenteer: children_changed_callback");
    safeLookForLowestNode();
}

function initSelectors(sels) {
    selectors = sels;
    selector_first_index = 0;
    current_selector_node = document;
    selector_last_index = selectors.length - 1;
}

function findArticleDiv() {
    initSelectors(["div#content",
                 "div.article__content",
                 "div.article-comments",
                 "div#comments",
                 "div#post-comment-form",
                 "div.comment-action-row",
                 "div.form-username"
                  ]);
    var node = document.querySelector("div.article");
    if (!node) {
        console.log("QQQ: stereogum-commenteer: not an article: " + ex);
        return;
    }
    safeLookForLowestNode();
}

try {
    findArticleDiv();
} catch(ex) {
    console.log("stereogum-commenteer: error in findCommentList: " + ex);
    console.table(ex);
}
